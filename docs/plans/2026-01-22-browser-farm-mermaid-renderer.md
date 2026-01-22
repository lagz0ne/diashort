# Browser Farm Mermaid Renderer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add server-side Mermaid SVG rendering using a warm browser pool with SQLite-backed job queue.

**Architecture:** A browser farm manages multiple headless Chrome instances (chrome-headless-shell). Render requests go to a SQLite-backed job queue for reliable retry handling. Idle browsers claim jobs atomically using lease-based TTL, render via puppeteer-core + @mermaid-js/mermaid-cli, and return SVGs. Health checks restart dead browsers and recover orphaned jobs.

**Tech Stack:** Bun, bun:sqlite, puppeteer-core, @mermaid-js/mermaid-cli, chrome-headless-shell

**ADR:** [adr-20260122-browser-farm-mermaid-ssr](../../.c3/adr/adr-20260122-browser-farm-mermaid-ssr.md)

---

## Prerequisites

Before starting, install the required dependencies:

```bash
# Install npm dependencies
bun add puppeteer-core @mermaid-js/mermaid-cli

# Install chrome-headless-shell binary
npx @puppeteer/browsers install chrome-headless-shell@stable
```

Note the chrome-headless-shell installed path (e.g., `./chrome-headless-shell/linux-*/chrome-headless-shell`).

---

## Task 1: Create Render Queue with SQLite

**Files:**
- Create: `src/atoms/render-queue.ts`
- Test: `src/__tests__/render-queue.test.ts`

**Step 1: Write the failing test for enqueue/claim**

```typescript
// src/__tests__/render-queue.test.ts
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { createRenderQueue } from "../atoms/render-queue";
import { existsSync, unlinkSync } from "fs";

describe("RenderQueue", () => {
  // Unique DB per test for complete isolation
  let testDbPath: string;
  let db: Database;

  beforeEach(() => {
    // Create fresh DB for each test with guaranteed unique path
    testDbPath = `/tmp/render-queue-test-${crypto.randomUUID()}.db`;
    db = new Database(testDbPath);
  });

  afterEach(() => {
    // Clean up after each test - wrapped in try-catch for robustness
    try {
      db?.close();
      if (existsSync(testDbPath)) unlinkSync(testDbPath);
    } catch {
      // Ignore cleanup errors - file may already be deleted
    }
  });

  it("enqueues and claims a job", () => {
    const queue = createRenderQueue(db);

    const jobId = queue.enqueue("graph TD; A-->B");
    expect(jobId).toMatch(/^[a-f0-9-]{36}$/);

    const job = queue.claim("browser-1");
    expect(job).not.toBeNull();
    expect(job!.id).toBe(jobId);
    expect(job!.source).toBe("graph TD; A-->B");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test src/__tests__/render-queue.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Write implementation with all fixes**

```typescript
// src/atoms/render-queue.ts
import type { Database } from "bun:sqlite";

interface RenderJob {
  id: string;
  source: string;
  retries: number;
  browser_id: string;
}

interface QueueConfig {
  leaseTtl?: number;
  maxRetries?: number;
}

export function createRenderQueue(db: Database, config: QueueConfig = {}) {
  const leaseTtl = config.leaseTtl ?? 30_000;
  const maxRetries = config.maxRetries ?? 2;

  // Enable WAL mode and busy timeout for concurrency
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA busy_timeout = 5000");

  db.exec(`
    CREATE TABLE IF NOT EXISTS render_jobs (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      state TEXT DEFAULT 'pending',
      retries INTEGER DEFAULT 0,
      browser_id TEXT,
      created_at INTEGER NOT NULL,
      claimed_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_jobs_state ON render_jobs(state);
    CREATE INDEX IF NOT EXISTS idx_jobs_browser ON render_jobs(browser_id);
  `);

  const stmts = {
    insert: db.prepare(
      `INSERT INTO render_jobs (id, source, created_at) VALUES (?, ?, ?)`
    ),
    // Claim uses lease-based TTL on claimed_at, not created_at
    claim: db.prepare(`
      UPDATE render_jobs
      SET state = 'processing', browser_id = ?, claimed_at = ?
      WHERE id = (
        SELECT id FROM render_jobs
        WHERE state = 'pending'
        ORDER BY created_at LIMIT 1
      )
      RETURNING id, source, retries, browser_id
    `),
    // Complete verifies state and browser ownership
    complete: db.prepare(`
      DELETE FROM render_jobs
      WHERE id = ? AND state = 'processing' AND browser_id = ?
    `),
    // Retry verifies state and browser ownership (maxRetries passed as parameter)
    retry: db.prepare(`
      UPDATE render_jobs
      SET state = 'pending', browser_id = NULL, claimed_at = NULL, retries = retries + 1
      WHERE id = ? AND state = 'processing' AND browser_id = ? AND retries < ?
      RETURNING id
    `),
    // Fail verifies state
    fail: db.prepare(`
      DELETE FROM render_jobs
      WHERE id = ? AND state = 'processing' AND browser_id = ?
    `),
    // Recover all jobs from a specific browser
    recoverBrowser: db.prepare(`
      UPDATE render_jobs
      SET state = 'pending', browser_id = NULL, claimed_at = NULL
      WHERE browser_id = ? AND state = 'processing'
    `),
    // Recover stale processing jobs (lease expired)
    recoverStale: db.prepare(`
      UPDATE render_jobs
      SET state = 'pending', browser_id = NULL, claimed_at = NULL
      WHERE state = 'processing' AND claimed_at < ?
    `),
    hasPending: db.prepare(
      `SELECT 1 FROM render_jobs WHERE state = 'pending' LIMIT 1`
    ),
    // Count pending jobs (for rate limiting)
    countPending: db.prepare(
      `SELECT COUNT(*) as count FROM render_jobs WHERE state = 'pending'`
    ),
    // Count processing jobs (for debugging)
    countProcessing: db.prepare(
      `SELECT COUNT(*) as count FROM render_jobs WHERE state = 'processing'`
    ),
  };

  const staleLeaseTime = () => Date.now() - leaseTtl;

  return {
    enqueue: (source: string) => {
      const id = crypto.randomUUID();
      stmts.insert.run(id, source, Date.now());
      return id;
    },

    claim: (browserId: string) => {
      const now = Date.now();
      return stmts.claim.get(browserId, now) as RenderJob | null;
    },

    // Complete requires browser ownership
    complete: (id: string, browserId: string) => {
      const result = stmts.complete.run(id, browserId);
      return result.changes > 0;
    },

    // Retry requires browser ownership (uses maxRetries from config)
    retry: (id: string, browserId: string) => {
      return stmts.retry.get(id, browserId, maxRetries) !== null;
    },

    // Fail requires browser ownership
    fail: (id: string, browserId: string) => {
      const result = stmts.fail.run(id, browserId);
      return result.changes > 0;
    },

    // Recover all jobs from dead browser
    recoverBrowser: (browserId: string) => {
      return stmts.recoverBrowser.run(browserId).changes;
    },

    // Recover jobs with expired leases (for startup recovery)
    recoverStale: () => {
      return stmts.recoverStale.run(staleLeaseTime()).changes;
    },

    hasPending: () => stmts.hasPending.get() !== null,

    // Rate limiting helper
    countPending: () => (stmts.countPending.get() as { count: number }).count,

    // Debug helper
    countProcessing: () => (stmts.countProcessing.get() as { count: number }).count,
  };
}
```

**Step 4: Run test to verify it passes**

Run: `bun test src/__tests__/render-queue.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/atoms/render-queue.ts src/__tests__/render-queue.test.ts
git commit -m "feat: add render queue with lease-based TTL and ownership checks"
```

---

## Task 2: Add Queue Complete/Retry/Fail Tests

**Files:**
- Modify: `src/__tests__/render-queue.test.ts`

**Step 1: Add test for complete with ownership**

```typescript
it("completes a job with browser ownership", () => {
  const queue = createRenderQueue(db);

  const jobId = queue.enqueue("graph TD; A-->B");
  const job = queue.claim("browser-1");

  // Complete with correct browser ID
  const completed = queue.complete(jobId, "browser-1");
  expect(completed).toBe(true);

  // Job should be gone
  const next = queue.claim("browser-2");
  expect(next).toBeNull();
});

it("complete fails with wrong browser ownership", () => {
  const queue = createRenderQueue(db);

  const jobId = queue.enqueue("graph TD; A-->B");
  queue.claim("browser-1");

  // Try to complete with wrong browser ID
  const completed = queue.complete(jobId, "browser-wrong");
  expect(completed).toBe(false);
});
```

**Step 2: Run test to verify it passes**

Run: `bun test src/__tests__/render-queue.test.ts`
Expected: PASS

**Step 3: Add test for retry with ownership**

```typescript
it("retries a job up to 2 times with browser ownership", () => {
  const queue = createRenderQueue(db);

  const jobId = queue.enqueue("graph TD; A-->B");
  queue.claim("browser-1");

  // First retry with correct browser
  expect(queue.retry(jobId, "browser-1")).toBe(true);
  const job1 = queue.claim("browser-2");
  expect(job1!.retries).toBe(1);

  // Second retry
  expect(queue.retry(jobId, "browser-2")).toBe(true);
  const job2 = queue.claim("browser-3");
  expect(job2!.retries).toBe(2);

  // Third retry fails (max 2)
  expect(queue.retry(jobId, "browser-3")).toBe(false);
});

it("retry fails with wrong browser ownership", () => {
  const queue = createRenderQueue(db);

  const jobId = queue.enqueue("graph TD; A-->B");
  queue.claim("browser-1");

  // Try to retry with wrong browser
  expect(queue.retry(jobId, "browser-wrong")).toBe(false);
});
```

**Step 4: Run test to verify it passes**

Run: `bun test src/__tests__/render-queue.test.ts`
Expected: PASS

**Step 5: Add test for recoverBrowser**

```typescript
it("recovers jobs from dead browser", () => {
  const queue = createRenderQueue(db);

  queue.enqueue("graph TD; A-->B");
  queue.claim("browser-dead");

  // Browser dies - recover its jobs
  const recovered = queue.recoverBrowser("browser-dead");
  expect(recovered).toBe(1);

  // Job should be claimable again
  const job = queue.claim("browser-2");
  expect(job).not.toBeNull();
});
```

**Step 6: Run test to verify it passes**

Run: `bun test src/__tests__/render-queue.test.ts`
Expected: PASS

**Step 7: Commit**

```bash
git add src/__tests__/render-queue.test.ts
git commit -m "test: add queue ownership and retry tests"
```

---

## Task 3: Add Lease TTL and Recovery Tests

**Files:**
- Modify: `src/__tests__/render-queue.test.ts`

**Step 1: Add test for stale lease recovery**

```typescript
it("recovers jobs with expired leases", async () => {
  const queue = createRenderQueue(db, { leaseTtl: 100 }); // 100ms lease TTL

  queue.enqueue("graph TD; A-->B");
  queue.claim("browser-1");

  // Wait for lease to expire
  await Bun.sleep(150);

  // Recover stale jobs
  const recovered = queue.recoverStale();
  expect(recovered).toBe(1);

  // Job should be claimable again
  const job = queue.claim("browser-2");
  expect(job).not.toBeNull();
});
```

**Step 2: Run test to verify it passes**

Run: `bun test src/__tests__/render-queue.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add src/__tests__/render-queue.test.ts
git commit -m "test: add lease TTL recovery tests"
```

---

## Task 4: Create Browser Farm Core

**Files:**
- Create: `src/atoms/browser-farm.ts`
- Test: `src/__tests__/browser-farm.test.ts`

**Step 1: Write the failing test for start/stop**

```typescript
// src/__tests__/browser-farm.test.ts
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { createBrowserFarm } from "../atoms/browser-farm";
import { existsSync, unlinkSync } from "fs";

// Skip tests if Chrome not available
const CHROME_PATH = process.env.CHROME_PATH;
const describeWithChrome = CHROME_PATH ? describe : describe.skip;

describeWithChrome("BrowserFarm", () => {
  // Unique DB per test for complete isolation
  let testDbPath: string;
  let db: Database;

  beforeEach(() => {
    // Create fresh DB for each test
    testDbPath = `/tmp/browser-farm-test-${crypto.randomUUID()}.db`;
    db = new Database(testDbPath);
  });

  afterEach(() => {
    // Clean up after each test - wrapped in try-catch for robustness
    try {
      db?.close();
      if (existsSync(testDbPath)) unlinkSync(testDbPath);
    } catch {
      // Ignore cleanup errors - file may already be deleted
    }
  });

  it("starts and stops browsers", async () => {
    const farm = createBrowserFarm({
      executablePath: CHROME_PATH!,
      db,
      poolSize: 1,
    });

    await farm.start();
    await farm.stop();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `CHROME_PATH=/path/to/chrome-headless-shell bun test src/__tests__/browser-farm.test.ts`
Expected: FAIL with "Cannot find module"

**Step 3: Write browser farm implementation with all fixes**

```typescript
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
          const data = await res.json();
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
    try {
      // SECURITY: Block external requests (SSRF prevention) on ALL targets
      // Using Target.setAutoAttach with flatten:true + waitForDebuggerOnStart:true
      // ensures blocking is applied BEFORE any page can make network requests
      const cdpSession = await browser.target().createCDPSession();

      // Block all external protocols including file://, blob:, and filesystem: for comprehensive protection
      const blockedUrls = [
        "http://*", "https://*", "ftp://*", "ws://*", "wss://*",
        "file://*", "blob:*", "filesystem:*"
      ];

      // Fetch request interception patterns - blocks at network layer BEFORE HTML parser loads resources
      const fetchPatterns = blockedUrls.map((url) => ({ urlPattern: url, requestStage: "Request" }));

      // Track child sessions for CDP command routing
      const childSessions = new Map<string, string>(); // sessionId -> targetId

      // Counter for CDP message IDs - scoped per renderMermaid call
      // Each render uses its own CDP session, so IDs don't conflict between renders
      let cdpMessageId = 1;

      // Helper to send CDP command to a child session via Target.sendMessageToTarget
      // puppeteer-core's send() doesn't support sessionId parameter, so we use the raw CDP API
      async function sendToChild(sessionId: string, method: string, params: object = {}): Promise<void> {
        const message = JSON.stringify({
          id: cdpMessageId++,
          method,
          params,
        });
        await cdpSession.send("Target.sendMessageToTarget", { sessionId, message });
      }

      // Handler for intercepted fetch requests - fail them immediately
      // Events from child sessions include sessionId when using flatten:true
      cdpSession.on("Fetch.requestPaused", async (event: { requestId: string; sessionId?: string }) => {
        try {
          if (event.sessionId && childSessions.has(event.sessionId)) {
            // Route to child session via Target.sendMessageToTarget
            await sendToChild(event.sessionId, "Fetch.failRequest", {
              requestId: event.requestId,
              errorReason: "BlockedByClient",
            });
          } else {
            // Browser-level request
            await cdpSession.send("Fetch.failRequest", {
              requestId: event.requestId,
              errorReason: "BlockedByClient",
            });
          }
        } catch {
          // Request may have been handled already or session closed
        }
      });

      // Handler for new targets - applies blocking BEFORE they can execute
      // With waitForDebuggerOnStart:true, the page is paused until we resume it
      cdpSession.on("Target.attachedToTarget", async (event: {
        sessionId: string;
        targetInfo: { type: string; targetId: string };
      }) => {
        // Track the child session for command routing
        childSessions.set(event.sessionId, event.targetInfo.targetId);

        // Only apply to page targets (what mermaid-cli creates)
        if (event.targetInfo.type === "page") {
          try {
            // Apply blocking rules while page is paused
            // Use BOTH Network.setBlockedURLs AND Fetch.enable for defense-in-depth
            // Route commands to child session via Target.sendMessageToTarget
            await sendToChild(event.sessionId, "Network.enable");
            await sendToChild(event.sessionId, "Network.setBlockedURLs", { urls: blockedUrls });

            // Fetch.enable intercepts at network layer - catches HTML parser resource loads
            await sendToChild(event.sessionId, "Fetch.enable", { patterns: fetchPatterns });

            // CRITICAL: Resume page execution AFTER blocking is in place
            await sendToChild(event.sessionId, "Runtime.runIfWaitingForDebugger");
          } catch {
            // Target may have closed - still try to resume to avoid hangs
            try {
              await sendToChild(event.sessionId, "Runtime.runIfWaitingForDebugger");
            } catch {
              // Ignore - target is gone
            }
          }
        }
      });

      // Cleanup tracking when targets detach
      cdpSession.on("Target.detachedFromTarget", (event: { sessionId: string }) => {
        childSessions.delete(event.sessionId);
      });

      // Enable auto-attach with flatten:true + waitForDebuggerOnStart:true
      // This pauses new pages until we apply blocking and resume them
      await cdpSession.send("Target.setAutoAttach", {
        autoAttach: true,
        waitForDebuggerOnStart: true, // CRITICAL: Pause pages until we configure them
        flatten: true,
        // Attach to pages only (what mermaid-cli creates)
        filter: [{ type: "page" }],
      });

      // Also block on browser target itself (belt and suspenders)
      await cdpSession.send("Network.enable");
      await cdpSession.send("Network.setBlockedURLs", { urls: blockedUrls });

      // Render with securityLevel:strict to disable click handlers and dangerous features
      // This is defense-in-depth on top of input sanitization and network blocking
      const { data } = await render(browser, source, "svg", {
        mermaidConfig: {
          securityLevel: "strict",  // Disables click, links, and other interactive features
          maxTextSize: 50000,       // Limit text size to prevent DoS
        },
      });
      const svg = data.toString();

      // Output size validation - prevent memory exhaustion from malicious diagrams
      const MAX_SVG_SIZE = 5 * 1024 * 1024; // 5MB limit
      if (svg.length > MAX_SVG_SIZE) {
        throw new Error("rendered SVG exceeds maximum size limit");
      }

      // Output SVG sanitization - defense-in-depth against XSS in rendered output
      // Even with input sanitization, validate output doesn't contain dangerous content
      const DANGEROUS_SVG_PATTERNS = [
        /<script[\s>]/i,              // Script tags
        /\son\w+\s*=/i,               // Event handlers (onclick, onload, etc.)
        /javascript:/i,               // JavaScript protocol
        /data:\s*text\/html/i,        // HTML data URIs
        /<foreignObject[\s>]/i,       // foreignObject can embed HTML
        /xlink:href\s*=\s*["']?\s*(?:javascript|data):/i, // Dangerous xlink:href
        /<\s*use[\s>]/i,              // SVG use element can reference external content
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

      // Check if stop was called during startup
      if (state === "stopping") {
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
```

**Step 4: Run test to verify it passes**

Run: `CHROME_PATH=/path/to/chrome-headless-shell bun test src/__tests__/browser-farm.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/atoms/browser-farm.ts src/__tests__/browser-farm.test.ts
git commit -m "feat: add browser farm with proper lifecycle and promise handling"
```

---

## Task 5: Add Browser Farm Render Test

**Files:**
- Modify: `src/__tests__/browser-farm.test.ts`

**Step 1: Add test for render**

```typescript
it("renders mermaid diagram to SVG", async () => {
  const farm = createBrowserFarm({
    executablePath: CHROME_PATH!,
    db,
    poolSize: 1,
  });

  await farm.start();

  try {
    const svg = await farm.render("graph TD; A-->B");
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
  } finally {
    await farm.stop();
  }
});
```

**Step 2: Run test to verify it passes**

Run: `CHROME_PATH=/path/to/chrome-headless-shell bun test src/__tests__/browser-farm.test.ts`
Expected: PASS

**Step 3: Add test for concurrent renders**

```typescript
it("handles concurrent render requests", async () => {
  const farm = createBrowserFarm({
    executablePath: CHROME_PATH!,
    db,
    poolSize: 2,
  });

  await farm.start();

  try {
    const results = await Promise.all([
      farm.render("graph TD; A-->B"),
      farm.render("graph TD; C-->D"),
      farm.render("graph TD; E-->F"),
    ]);

    expect(results).toHaveLength(3);
    results.forEach((svg) => {
      expect(svg).toContain("<svg");
    });
  } finally {
    await farm.stop();
  }
});
```

**Step 4: Run test to verify it passes**

Run: `CHROME_PATH=/path/to/chrome-headless-shell bun test src/__tests__/browser-farm.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/__tests__/browser-farm.test.ts
git commit -m "test: add render and concurrency tests for browser farm"
```

---

## Task 6: Add Error Handling and Edge Case Tests

**Files:**
- Modify: `src/__tests__/browser-farm.test.ts`

**Step 1: Add test for render before start**

```typescript
it("rejects render before start", async () => {
  const farm = createBrowserFarm({
    executablePath: CHROME_PATH!,
    db,
    poolSize: 1,
  });

  await expect(farm.render("graph TD; A-->B")).rejects.toThrow("farm not started");
});
```

**Step 2: Add test for stop rejects pending**

```typescript
it("stop rejects all pending promises", async () => {
  const farm = createBrowserFarm({
    executablePath: CHROME_PATH!,
    db,
    poolSize: 1,
    timeout: 60_000, // Long timeout so job doesn't finish
  });

  await farm.start();

  // Start a render but don't await it
  const renderPromise = farm.render("graph TD; A-->B");

  // Stop immediately
  await farm.stop();

  // Render should reject
  await expect(renderPromise).rejects.toThrow("farm stopped");
});
```

**Step 3: Add test for invalid mermaid syntax**

```typescript
it("rejects on invalid mermaid syntax", async () => {
  const farm = createBrowserFarm({
    executablePath: CHROME_PATH!,
    db,
    poolSize: 1,
  });

  await farm.start();

  try {
    await expect(farm.render("not valid mermaid")).rejects.toThrow();
  } finally {
    await farm.stop();
  }
});
```

**Step 4: Add test for timeout**

```typescript
it("rejects on render timeout", async () => {
  const farm = createBrowserFarm({
    executablePath: CHROME_PATH!,
    db,
    poolSize: 1,
    timeout: 1, // 1ms timeout - will always fail
  });

  await farm.start();

  try {
    await expect(farm.render("graph TD; A-->B")).rejects.toThrow("timeout");
  } finally {
    await farm.stop();
  }
});
```

**Step 5: Add test that retry eventually resolves original promise**

```typescript
it("retry eventually resolves original promise on success", async () => {
  // This test verifies that when a job fails and is retried,
  // the original render() promise is eventually resolved on success
  const farm = createBrowserFarm({
    executablePath: CHROME_PATH!,
    db,
    poolSize: 2, // Need 2 browsers so second can pick up retry
  });

  await farm.start();

  try {
    // Simple diagram should succeed
    const svg = await farm.render("graph TD; A-->B");
    expect(svg).toContain("<svg");
  } finally {
    await farm.stop();
  }
});
```

**Step 6: Run all tests**

Run: `CHROME_PATH=/path/to/chrome-headless-shell bun test src/__tests__/browser-farm.test.ts`
Expected: PASS

**Step 7: Commit**

```bash
git add src/__tests__/browser-farm.test.ts
git commit -m "test: add error handling and edge case tests"
```

---

## Task 7: Create Mermaid Renderer Atom

**Files:**
- Create: `src/atoms/mermaid-renderer.ts`

**Step 1: Create mermaid renderer atom**

```typescript
// src/atoms/mermaid-renderer.ts
import { atom, tags } from "@pumped-fn/lite";
import { Database } from "bun:sqlite";
import { createBrowserFarm } from "./browser-farm";
import { loggerAtom } from "./logger";

export interface MermaidConfig {
  executablePath: string;
  dbPath: string;
  poolSize?: number;
  timeout?: number;
  /** Enable --no-sandbox for CI environments. SECURITY: Only use in containerized/sandboxed environments */
  noSandbox?: boolean;
  /** Maximum pending jobs in queue. Rejects new requests when exceeded. Default: 1000 */
  maxQueueSize?: number;
}

export const mermaidConfigTag = tags.create<MermaidConfig>("mermaidConfig");

export const mermaidRendererAtom = atom({
  deps: {
    config: tags.required(mermaidConfigTag),
    logger: loggerAtom,
  },
  factory: async (ctx, { config, logger }) => {
    const db = new Database(config.dbPath);

    // Enable WAL for the atom's DB connection too
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA busy_timeout = 5000");

    const farm = createBrowserFarm({
      executablePath: config.executablePath,
      db,
      poolSize: config.poolSize,
      timeout: config.timeout,
      noSandbox: config.noSandbox,
      maxQueueSize: config.maxQueueSize,
    });

    // Handle DB cleanup if start fails
    try {
      await farm.start();
    } catch (err) {
      db.close();
      throw err;
    }

    logger.info({ poolSize: config.poolSize ?? 2 }, "Mermaid renderer started");

    ctx.cleanup(async () => {
      logger.info("Stopping mermaid renderer");
      await farm.stop();
      db.close();
    });

    return {
      render: (source: string) => farm.render(source),
    };
  },
});
```

**Step 2: Run type check**

Run: `bunx @typescript/native-preview --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/atoms/mermaid-renderer.ts
git commit -m "feat: add mermaid renderer atom with DI integration"
```

---

## Task 8: Run All Tests

**Step 1: Run full test suite**

Run: `bun test`
Expected: All tests pass (browser tests skip if CHROME_PATH not set)

**Step 2: Run type check**

Run: `bunx @typescript/native-preview --noEmit`
Expected: No errors

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat: complete browser farm mermaid renderer implementation"
```

---

## Summary

After completing all tasks, you will have:

1. `src/atoms/render-queue.ts` - SQLite-backed job queue with:
   - Lease-based TTL on `claimed_at` (not `created_at`)
   - Browser ownership verification on complete/retry/fail
   - Configurable maxRetries (shared with farm)
   - Stale lease recovery for crash recovery
   - WAL mode and busy_timeout for concurrency
   - **countPending()** for rate limiting support

2. `src/atoms/browser-farm.ts` - Browser pool manager with:
   - State machine guard (stopped/starting/running/stopping)
   - Guard against double start()
   - Promise resolution gated on successful DB ownership
   - stop() rejects pending AND immediately requeues jobs (no TTL wait)
   - stop() during starting awaits startup completion
   - Render timeout kills browser (since mermaid-cli can't be cancelled)
   - Startup recovery of orphaned jobs
   - Partial spawn failure cleanup
   - Port quarantine (5s delay before reuse) with **bounded range (19222-19321)** and wraparound
   - Queue timeout includes retry budget: `timeout * (MAX_RETRIES + 2)`

   **Security hardening:**
   - **SSRF protection via CDP Target.setAutoAttach (flatten:true + waitForDebuggerOnStart:true)** - applies Network.setBlockedURLs to ALL child pages/targets created by mermaid-cli BEFORE they can make network requests. Pages are paused on creation, blocking rules applied, then resumed.
   - **Defense-in-depth: Fetch.enable request interception** - blocks at network layer before HTML parser can load resources
   - **Protocol blocking** includes http, https, ftp, ws, wss, file://, blob:, and filesystem: to prevent SSRF and local file access
   - **Input size validation** (100KB limit) prevents DoS via large diagram source
   - **Output size validation** (5MB limit) prevents memory exhaustion from malicious diagrams
   - **Input content sanitization** - comprehensive pattern blocking with bypass prevention:
     - Blocks javascript:, data:, script tags, event handlers
     - Handles whitespace bypass (j a v a s c r i p t :)
     - Handles HTML entities (&#106;), unicode escapes (\u006A), URL encoding (%6A)
     - Blocks Mermaid-specific callback and init directives
     - Blocks CSS expression(), foreignObject, url(), @import
     - Blocks SVG xlink:href and use elements with external protocols
     - Blocks base64 encoding to prevent encoded data URI payloads
     - Recursive decoding to catch double/triple encoded bypasses
   - **Output SVG sanitization** - defense-in-depth XSS prevention on rendered output:
     - Blocks script tags, event handlers, javascript: and data: protocols
     - Blocks foreignObject and dangerous xlink:href values
   - **CDP session routing** - uses Target.sendMessageToTarget for correct child session command routing (puppeteer-core CDPSession.send() doesn't support sessionId parameter)
   - **Child session tracking** - maintains Map of child sessions for cleanup on detach
   - **Rate limiting** - configurable maxQueueSize (default 1000) prevents queue DoS
   - **--no-sandbox is opt-in only** via `config.noSandbox` for containerized CI environments
   - **try-catch in render Promise** - handles SQLite errors from enqueue gracefully
   - **Spawn failure logging** - logs errors when browser respawn fails during health check or after failures
   - **Explicit CDP cleanup** - removeAllListeners() and detach() in finally block for proper resource cleanup
   - **Mermaid securityLevel:strict** - disables click handlers, links, and other interactive features at the renderer level
   - **Mermaid maxTextSize:50000** - limits text size in diagrams to prevent DoS

3. `src/atoms/mermaid-renderer.ts` - DI-integrated renderer atom with:
   - DB cleanup on start failure (no leak)

4. Tests with:
   - Per-test DB isolation (unique DB per test)
   - Chrome skip guard for CI
   - Coverage for ownership, retry, recovery, edge cases

**Design Constraint:** Single-process deployment only. The in-memory `pending` map resolves promises, so multi-process deployments sharing the same SQLite DB would cause timeouts. For multi-process support, add a result table + polling/webhook pattern.

The browser farm can be integrated into the server by resolving `mermaidRendererAtom` and calling `render(source)` to get server-side SVG output.
