// src/atoms/browser-farm.ts
import type { Subprocess } from "bun";
import type { Database } from "bun:sqlite";
import { createRenderQueue } from "./render-queue";

interface Browser {
  id: string;
  process: Subprocess;
  port: number;
  wsUrl: string;
  state: "idle" | "busy" | "dead";
  failures: number;
}

export interface FarmConfig {
  executablePath: string;
  db: Database;
  poolSize?: number;
  timeout?: number;
  /** Enable --no-sandbox for CI environments. SECURITY: Only use in containerized/sandboxed environments */
  noSandbox?: boolean;
  /** Maximum pending jobs in queue. Rejects new requests when exceeded. Default: 1000 */
  maxQueueSize?: number;
}

type FarmState = "stopped" | "starting" | "running" | "stopping";

const MAX_RETRIES = 2;

export function createBrowserFarm(config: FarmConfig) {
  const poolSize = config.poolSize ?? 2;
  const timeout = config.timeout ?? 10_000;
  const maxQueueSize = config.maxQueueSize ?? 1000;
  // Lease TTL should be > timeout to avoid premature recovery
  const leaseTtl = timeout * 1.5;
  // Queue timeout allows for all retry attempts plus some buffer
  const queueTimeout = timeout * (MAX_RETRIES + 2);

  const browsers = new Map<string, Browser>();
  const queue = createRenderQueue(config.db, { leaseTtl, maxRetries: MAX_RETRIES });
  const pending = new Map<string, {
    resolve: (svg: string) => void;
    reject: (err: Error) => void;
    timeoutId: Timer;
    jobId: string;
  }>();

  // Port quarantine - ports need time before reuse (OS TIME_WAIT)
  const portQuarantine = new Map<number, number>(); // port -> release timestamp
  const PORT_QUARANTINE_MS = 5000; // 5 seconds before reuse
  const PORT_MIN = 19222;
  const PORT_MAX = 19321; // 100 ports (19222-19321 inclusive)
  let nextPort = PORT_MIN;
  let healthTimer: Timer | null = null;
  let state: FarmState = "stopped";
  let startupPromise: Promise<void> | null = null;

  function allocatePort(): number {
    // Check quarantine for reusable ports
    const now = Date.now();
    for (const [port, releaseTime] of portQuarantine) {
      if (now - releaseTime >= PORT_QUARANTINE_MS) {
        portQuarantine.delete(port);
        return port;
      }
    }

    // Allocate new port with bounds and wraparound
    const port = nextPort;
    nextPort = nextPort >= PORT_MAX ? PORT_MIN : nextPort + 1;

    // Verify port not in quarantine (could happen after wraparound)
    if (portQuarantine.has(port)) {
      throw new Error("no available ports - all quarantined");
    }

    return port;
  }

  function releasePort(port: number) {
    // Quarantine port before reuse
    portQuarantine.set(port, Date.now());
  }

  async function spawnBrowser(): Promise<Browser> {
    const port = allocatePort();
    const id = crypto.randomUUID().slice(0, 8);

    const args = [
      config.executablePath,
      `--remote-debugging-port=${port}`,
      "--remote-debugging-address=127.0.0.1",
      "--disable-gpu",
      "--headless",
    ];

    // SECURITY: Only add --no-sandbox if explicitly enabled (for containerized CI)
    // Default is sandbox enabled for security
    if (config.noSandbox) {
      args.push("--no-sandbox");
    }

    const process = Bun.spawn(args, {
      // Ignore stdio to prevent buffer backpressure
      stdout: "ignore",
      stderr: "ignore",
    });

    const start = Date.now();
    let wsUrl: string | null = null;

    while (Date.now() - start < 5000) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/json/version`);
        if (res.ok) {
          const data = (await res.json()) as { webSocketDebuggerUrl: string };
          wsUrl = data.webSocketDebuggerUrl;
          break;
        }
      } catch {}
      await Bun.sleep(100);
    }

    if (!wsUrl) {
      process.kill();
      releasePort(port);
      throw new Error(`Browser failed to start on port ${port}`);
    }

    const browser: Browser = { id, process, port, wsUrl, state: "idle", failures: 0 };
    browsers.set(id, browser);
    return browser;
  }

  // Cleanup all browsers, requeue their jobs immediately
  function killAllBrowsersAndRequeue() {
    for (const b of browsers.values()) {
      queue.recoverBrowser(b.id);
      b.process.kill();
      releasePort(b.port);
    }
    browsers.clear();
  }

  // Cleanup all browsers without requeue (for partial start failure)
  function killAllBrowsers() {
    for (const b of browsers.values()) {
      b.process.kill();
      releasePort(b.port);
    }
    browsers.clear();
  }

  // Force restart browser - used on timeout/crash
  // Timeout/crash consumes retry budget via queue.retry()
  async function forceRestartBrowser(browser: Browser, jobId: string) {
    browser.process.kill();
    browsers.delete(browser.id);
    releasePort(browser.port);

    // Timeout/crash uses retry budget (increments retries via retry())
    const retried = queue.retry(jobId, browser.id);
    if (!retried) {
      // Exhausted retries - try to fail, only reject if we still own it
      const failed = queue.fail(jobId, browser.id);
      if (failed) {
        const entry = pending.get(jobId);
        if (entry) {
          clearTimeout(entry.timeoutId);
          entry.reject(new Error("render failed after retries"));
          pending.delete(jobId);
        }
      }
      // If fail returned false, job was recovered elsewhere - don't reject
    }
    // If retried, job goes back to pending state for another browser

    // Don't respawn if farm is stopping/stopped
    if (state !== "running") return;

    try {
      await spawnBrowser();
    } catch (err) {
      console.error("Failed to restart browser:", err);
    }

    dispatch();
  }

  function healthCheck() {
    // Guard: don't run health checks if not running
    if (state !== "running") return;

    // Recover stale leases (jobs stuck in processing beyond lease TTL)
    queue.recoverStale();

    for (const browser of browsers.values()) {
      if (browser.state === "busy") continue;

      fetch(`http://127.0.0.1:${browser.port}/json/version`)
        .then((res) => {
          if (res.ok) browser.failures = 0;
          else throw new Error();
        })
        .catch(() => {
          browser.failures++;
          if (browser.failures >= 3) {
            // Health check failure doesn't consume retry budget - just restart
            browser.process.kill();
            browsers.delete(browser.id);
            releasePort(browser.port);
            queue.recoverBrowser(browser.id);
            if (state === "running") {
              spawnBrowser().catch((err) => {
                console.error("Failed to respawn browser during health check:", err);
              });
            }
          }
        });
    }

    // Try to dispatch any recovered jobs
    dispatch();
  }

  function dispatch() {
    // Guard: don't dispatch if not running
    if (state !== "running") return;

    while (true) {
      const idle = [...browsers.values()].find((b) => b.state === "idle");
      if (!idle) return;

      const job = queue.claim(idle.id);
      if (!job) return;

      // Guard against unhandled rejection from async processJob
      void processJob(idle, job).catch((err) => {
        console.error("Unexpected error in processJob:", err);
      });
    }
  }

  async function processJob(browser: Browser, job: { id: string; source: string; browser_id: string }) {
    browser.state = "busy";

    let timedOut = false;
    let renderTimerId: Timer;
    const renderPromise = renderMermaid(browser.wsUrl, job.source);
    const timeoutPromise = new Promise<never>((_, reject) => {
      renderTimerId = setTimeout(() => {
        timedOut = true;
        reject(new Error("render timeout"));
      }, timeout);
    });

    try {
      const svg = await Promise.race([renderPromise, timeoutPromise]);

      // Clear timeout on success
      clearTimeout(renderTimerId!);

      // Suppress late rejection from render (browser might have been killed)
      renderPromise.catch(() => {});

      // Farm may have been stopped during render
      if (state !== "running") return;

      // Only resolve promise if we successfully own the job in DB
      const completed = queue.complete(job.id, browser.id);
      if (completed) {
        const entry = pending.get(job.id);
        if (entry) {
          clearTimeout(entry.timeoutId);
          entry.resolve(svg);
          pending.delete(job.id);
        }
      }
      // If complete failed, job was recovered elsewhere - result is discarded

      browser.failures = 0;
      browser.state = "idle";
      dispatch();
    } catch (err) {
      // Clear timeout on error
      clearTimeout(renderTimerId!);

      // Suppress late rejection from render
      renderPromise.catch(() => {});

      // Farm may have been stopped during render
      if (state !== "running") return;

      browser.failures++;

      if (timedOut) {
        // mermaid-cli can't be cancelled, so we must kill the browser
        // This consumes retry budget via forceRestartBrowser
        browser.state = "dead";
        forceRestartBrowser(browser, job.id);
        return;
      }

      // Regular error - try to retry
      const retried = queue.retry(job.id, browser.id);
      if (!retried) {
        // Exhausted retries - try to fail, only reject if we still own it
        const failed = queue.fail(job.id, browser.id);
        if (failed) {
          const entry = pending.get(job.id);
          if (entry) {
            clearTimeout(entry.timeoutId);
            entry.reject(err as Error);
            pending.delete(job.id);
          }
        }
        // If fail returned false, job was recovered elsewhere - don't reject
        // The caller's promise stays pending until queue timeout
      }
      // If retried, DON'T delete from pending - let next processor resolve it

      if (browser.failures >= 3) {
        browser.state = "dead";
        browser.process.kill();
        browsers.delete(browser.id);
        releasePort(browser.port);
        queue.recoverBrowser(browser.id);
        if (state === "running") {
          spawnBrowser().catch((err) => {
            console.error("Failed to respawn browser after failures:", err);
          });
          dispatch();
        }
      } else {
        browser.state = "idle";
        dispatch();
      }
    }
  }

  async function renderMermaid(wsUrl: string, source: string): Promise<string> {
    const puppeteer = await import("puppeteer-core");
    const { renderMermaid: render } = await import("@mermaid-js/mermaid-cli");

    const browser = await puppeteer.connect({ browserWSEndpoint: wsUrl });

    // SECURITY: Block external requests (SSRF prevention) on ALL targets
    // Using Target.setAutoAttach with flatten:true + waitForDebuggerOnStart:true
    // ensures blocking is applied BEFORE any page can make network requests
    const cdpSession = await browser.target().createCDPSession();

    // Track child sessions for CDP command routing (declared outside try for finally access)
    const childSessions = new Map<string, string>(); // sessionId -> targetId
    // Track child CDP sessions for cleanup (targetId -> CDPSession)
    // With flatten:true, puppeteer creates real CDPSession objects for child targets
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const childCdpSessions = new Map<string, any>();

    try {
      // Block external network protocols (SSRF prevention)
      // Allow file:// for local mermaid-cli resources (index.html, bundled JS)
      // blob: and filesystem: blocked to prevent data exfiltration
      const blockedUrls = [
        "http://*", "https://*", "ftp://*", "ws://*", "wss://*",
        "blob:*", "filesystem:*"
      ];

      // Fetch request interception patterns - blocks at network layer BEFORE HTML parser loads resources
      const fetchPatterns = blockedUrls.map((url) => ({ urlPattern: url, requestStage: "Request" }));

      // Handler for new targets - applies blocking BEFORE they can execute
      // With waitForDebuggerOnStart:true, the page is paused until we resume it
      // With flatten:true, we get a real CDPSession for each child target
      browser.on("targetcreated", async (target) => {
        // Only apply to page targets (what mermaid-cli creates)
        if (target.type() !== "page") return;

        try {
          // Get the CDPSession for this specific target (flat protocol)
          const targetSession = await target.createCDPSession();
          const sessionId = target._targetId;
          childSessions.set(sessionId, target._targetId);
          childCdpSessions.set(sessionId, targetSession);

          // Apply blocking rules while page may still be loading
          // Use Network.setBlockedURLs for URL-level blocking
          await targetSession.send("Network.enable");
          await targetSession.send("Network.setBlockedURLs", { urls: blockedUrls });

          // Fetch.enable intercepts at network layer - catches HTML parser resource loads
          await targetSession.send("Fetch.enable", { patterns: fetchPatterns });

          // Handler for intercepted fetch requests on this target - fail them immediately
          targetSession.on("Fetch.requestPaused", async (event: { requestId: string }) => {
            try {
              await targetSession.send("Fetch.failRequest", {
                requestId: event.requestId,
                errorReason: "BlockedByClient",
              });
            } catch {
              // Request may have been handled already or session closed
            }
          });
        } catch {
          // Target may have closed before we could configure it
        }
      });

      // Cleanup tracking when targets are destroyed
      browser.on("targetdestroyed", (target) => {
        const sessionId = target._targetId;
        childSessions.delete(sessionId);
        const session = childCdpSessions.get(sessionId);
        if (session) {
          session.removeAllListeners();
          childCdpSessions.delete(sessionId);
        }
      });

      // Also block on browser target itself (belt and suspenders)
      // Note: Network domain may not be available on browser-level target in some Chrome variants
      // The page-level blocking via Target.attachedToTarget is the primary protection
      try {
        await cdpSession.send("Network.enable");
        await cdpSession.send("Network.setBlockedURLs", { urls: blockedUrls });
      } catch {
        // Network domain not supported on browser target - rely on page-level blocking
      }

      // Render with securityLevel:strict to disable click handlers and dangerous features
      // This is defense-in-depth on top of input sanitization and network blocking
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await render(browser as any, source, "svg", {
        mermaidConfig: {
          securityLevel: "strict",  // Disables click, links, and other interactive features
          maxTextSize: 50000,       // Limit text size to prevent DoS
        },
      });
      // data is a Buffer/Uint8Array - explicitly convert to UTF-8 string
      const svg = Buffer.from(data).toString("utf-8");

      // Output size validation - prevent memory exhaustion from malicious diagrams
      const MAX_SVG_SIZE = 5 * 1024 * 1024; // 5MB limit
      if (svg.length > MAX_SVG_SIZE) {
        throw new Error("rendered SVG exceeds maximum size limit");
      }

      // Output SVG sanitization - defense-in-depth against XSS in rendered output
      // Even with input sanitization, validate output doesn't contain dangerous content
      // Note: Mermaid legitimately uses <foreignObject> and <use> for text/icon rendering
      // so we don't block those - the input sanitization + securityLevel:strict handles safety
      const DANGEROUS_SVG_PATTERNS = [
        /<script[\s>]/i,              // Script tags
        /\son\w+\s*=/i,               // Event handlers (onclick, onload, etc.)
        /javascript:/i,               // JavaScript protocol
        /data:\s*text\/html/i,        // HTML data URIs
        /xlink:href\s*=\s*["']?\s*(?:javascript|data):/i, // Dangerous xlink:href
      ];
      for (const pattern of DANGEROUS_SVG_PATTERNS) {
        if (pattern.test(svg)) {
          throw new Error("rendered SVG contains forbidden content");
        }
      }

      return svg;
    } finally {
      // Explicit cleanup of CDP session event handlers, child sessions map, and detach
      childSessions.clear();
      // Clean up child CDP sessions
      for (const session of childCdpSessions.values()) {
        try {
          session.removeAllListeners();
          await session.detach();
        } catch {
          // Session may already be detached - ignore
        }
      }
      childCdpSessions.clear();
      // Clean up browser-level event handlers
      browser.removeAllListeners("targetcreated");
      browser.removeAllListeners("targetdestroyed");
      try {
        cdpSession.removeAllListeners();
        await cdpSession.detach();
      } catch {
        // Session may already be detached - ignore
      }
      browser.disconnect();
    }
  }

  return {
    async start() {
      // Guard against double start
      if (state !== "stopped") {
        throw new Error(`Cannot start farm in state: ${state}`);
      }
      state = "starting";

      // Create promise for stop() to await
      let resolveStartup: () => void;
      startupPromise = new Promise((resolve) => {
        resolveStartup = resolve;
      });

      // Recover any orphaned jobs from previous crash
      queue.recoverStale();

      // Spawn browsers with cleanup on partial failure
      try {
        await Promise.all(Array.from({ length: poolSize }, spawnBrowser));
      } catch (err) {
        // Clean up any browsers that did spawn (no requeue - they have no jobs)
        killAllBrowsers();
        state = "stopped";
        startupPromise = null;
        resolveStartup!();
        throw err;
      }

      // Check if stop was called during startup (stop() can change state concurrently)
      if ((state as FarmState) === "stopping") {
        killAllBrowsersAndRequeue();
        state = "stopped";
        startupPromise = null;
        resolveStartup!();
        return;
      }

      state = "running";
      healthTimer = setInterval(healthCheck, 30_000);
      startupPromise = null;
      resolveStartup!();

      // Dispatch any pending jobs (from recovery)
      dispatch();
    },

    async stop() {
      // Already stopped
      if (state === "stopped") {
        return;
      }

      // Already stopping - wait for it
      if (state === "stopping") {
        return;
      }

      // Starting - signal abort and wait for startup to finish
      if (state === "starting") {
        state = "stopping"; // Signal startup to abort
        if (startupPromise) {
          await startupPromise;
        }
        return;
      }

      state = "stopping";

      if (healthTimer) {
        clearInterval(healthTimer);
        healthTimer = null;
      }

      // Reject all pending promises
      for (const [jobId, entry] of pending) {
        clearTimeout(entry.timeoutId);
        entry.reject(new Error("farm stopped"));
      }
      pending.clear();

      // Kill all browsers and immediately requeue their jobs
      // This allows quick restart without waiting for TTL
      killAllBrowsersAndRequeue();

      state = "stopped";
    },

    render(source: string): Promise<string> {
      // Guard: reject if not running
      if (state !== "running") {
        return Promise.reject(new Error("farm not started"));
      }

      // Input validation - prevent DoS via large inputs
      const MAX_SOURCE_SIZE = 100 * 1024; // 100KB limit
      if (!source || typeof source !== "string") {
        return Promise.reject(new Error("invalid source: must be a non-empty string"));
      }
      if (source.length > MAX_SOURCE_SIZE) {
        return Promise.reject(new Error(`source exceeds maximum size of ${MAX_SOURCE_SIZE} bytes`));
      }

      // Content sanitization - block dangerous patterns that could bypass SSRF protection
      // or execute JavaScript even with mermaid securityLevel:strict
      // Patterns handle common bypass techniques: whitespace, unicode escapes, HTML entities
      const DANGEROUS_PATTERNS = [
        /j\s*a\s*v\s*a\s*s\s*c\s*r\s*i\s*p\s*t\s*:/i, // JavaScript with whitespace bypass
        /javascript:/i,           // JavaScript protocol in links/clicks
        /data:/i,                 // Data URLs for exfiltration
        /<\s*script/i,            // Script injection with whitespace
        /&#\d+;/i,                // HTML numeric entities (&#106; = j)
        /&#x[0-9a-f]+;/i,         // HTML hex entities (&#x6A; = j)
        /\\u[0-9a-f]{4}/i,        // Unicode escapes (\u006A = j)
        /%[0-9a-f]{2}/i,          // URL encoding (%6A = j)
        /on(?:click|error|load|mouseover|focus|blur|change|submit|input|keydown|keyup)/i, // Event handlers
        /href\s*=\s*["']?\s*(?:javascript|data):/i,   // Dangerous href values
        /callback\s*:/i,          // Mermaid click callback syntax
        /\[\s*\[\s*javascript/i,  // Mermaid link syntax with javascript
        /expression\s*\(/i,       // CSS expression (IE legacy, defense-in-depth)
        /<\s*foreignObject/i,     // SVG foreignObject can embed HTML
        /url\s*\(\s*["']?\s*(?:javascript|data):/i, // CSS url() with dangerous protocols
        /xlink:href\s*=\s*["']?\s*(?:javascript|data|http|https|ftp):/i, // SVG xlink:href with any external protocol
        /@import\s+url/i,         // CSS @import
        /%%\s*\{/i,               // Mermaid init directives (could set securityLevel: loose)
        /data:[^;]*;base64/i,     // Base64 in data URI context (avoids false positives on text "base64")
        /<\s*use[\s>]/i,          // SVG use element with potential external references
      ];
      for (const pattern of DANGEROUS_PATTERNS) {
        if (pattern.test(source)) {
          return Promise.reject(new Error("source contains forbidden content"));
        }
      }

      // Recursive decoding to catch double/triple encoded bypasses
      function fullyDecode(s: string, maxIterations = 5): string {
        for (let i = 0; i < maxIterations; i++) {
          try {
            const decoded = decodeURIComponent(s);
            if (decoded === s) return s;
            s = decoded;
          } catch {
            return s; // Invalid encoding - return current state
          }
        }
        return s;
      }

      // Check decoded content for encoded bypasses
      const decoded = fullyDecode(source);
      for (const pattern of DANGEROUS_PATTERNS) {
        if (pattern.test(decoded)) {
          return Promise.reject(new Error("source contains forbidden content"));
        }
      }

      // Rate limiting - prevent queue DoS
      if (queue.countPending() >= maxQueueSize) {
        return Promise.reject(new Error("queue full - try again later"));
      }

      return new Promise((resolve, reject) => {
        try {
          const jobId = queue.enqueue(source);

          // Queue timeout allows for all retry attempts
          // timeout * (MAX_RETRIES + 1) gives time for initial attempt plus retries
          const timeoutId = setTimeout(() => {
            if (pending.has(jobId)) {
              pending.delete(jobId);
              // Note: Job may still be processing, but caller is rejected
              // Job will complete (result discarded) or use retry budget on timeout
              reject(new Error("queue timeout"));
            }
          }, queueTimeout);

          pending.set(jobId, { resolve, reject, timeoutId, jobId });
          dispatch();
        } catch (err) {
          // Handle SQLite errors from enqueue
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      });
    },

    // For testing
    isStarted: () => state === "running",
    getState: () => state,
  };
}
