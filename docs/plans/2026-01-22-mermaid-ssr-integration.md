# Mermaid SSR Integration Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wire the mermaid renderer (browser farm) into the embed flow so `/e/:shortlink` returns server-side rendered SVG for mermaid diagrams.

**Architecture:** The `mermaidRendererAtom` already exists and uses a browser farm with chrome-headless-shell. We need to: (1) add mermaidConfigTag to server config, (2) add mermaidRenderer as a dependency to the embed flow, (3) update create flow to return embed URL for mermaid, (4) merge chrome-headless-shell into existing Dockerfile (preserving D2 support).

**Tech Stack:** Bun, @pumped-fn/lite (DI), puppeteer-core, @mermaid-js/mermaid-cli, chrome-headless-shell

---

### Task 1: Add Mermaid Config Tag to Server Configuration

**Files:**
- Modify: `src/config/tags.ts`

**Step 1: Add mermaid config interface and tag**

Add to `src/config/tags.ts` after the existing imports and interfaces:

```typescript
export interface MermaidConfig {
  executablePath: string;
  dbPath: string;
  poolSize?: number;
  timeout?: number;
  /** Enable --no-sandbox for containerized environments. SECURITY: Opt-in only */
  noSandbox?: boolean;
  maxQueueSize?: number;
}

export const mermaidConfigTag = tag<MermaidConfig>({
  label: "mermaid-config",
});
```

**Step 2: Add mermaid config parsing to loadConfigTags**

Add mermaid config parsing before the return statement:

```typescript
  // Mermaid renderer config (optional - only needed for mermaid SSR)
  const chromePath = getEnv(env, "CHROME_PATH");
  const mermaidConfig: MermaidConfig | undefined = chromePath ? {
    executablePath: chromePath,
    dbPath: getEnv(env, "MERMAID_DB_PATH") ?? "./data/mermaid-queue.db",
    poolSize: parseNumber(env, "MERMAID_POOL_SIZE", 2),
    timeout: parseNumber(env, "MERMAID_TIMEOUT", 30000),
    noSandbox: parseBool(env, "MERMAID_NO_SANDBOX", false),
    maxQueueSize: parseNumber(env, "MERMAID_MAX_QUEUE", 1000),
  } : undefined;

  const tags = [
    logLevelTag(logLevel),
    nodeEnvTag(nodeEnv),
    serverPortTag(serverPort),
    authEnabledTag(authEnabled),
    authCredentialsTag(authCredentials),
    baseUrlTag(baseUrl),
    diagramConfigTag({
      dbPath: diagramDbPath,
      retentionDays: diagramRetentionDays,
      cleanupIntervalMs,
    }),
  ];

  // Only add mermaid config if Chrome is available
  if (mermaidConfig) {
    tags.push(mermaidConfigTag(mermaidConfig));
  }

  return tags;
```

**Step 3: Commit**

```bash
git add src/config/tags.ts
git commit -m "feat: add mermaid config tag to server configuration"
```

---

### Task 2: Update Mermaid Renderer Atom to Use Shared Config Tag

**Files:**
- Modify: `src/atoms/mermaid-renderer.ts`

**Step 1: Import mermaidConfigTag from config/tags**

Update the imports:

```typescript
import { atom, tags } from "@pumped-fn/lite";
import { Database } from "bun:sqlite";
import { createBrowserFarm } from "./browser-farm";
import { loggerAtom } from "./logger";
import { mermaidConfigTag } from "../config/tags";

export type { MermaidConfig } from "../config/tags";
```

**Step 2: Remove the duplicate mermaidConfigTag definition**

Remove these lines (keep only the atom):

```typescript
// REMOVE:
// export interface MermaidConfig { ... }
// export const mermaidConfigTag = tag<MermaidConfig>({ ... });
```

**Step 3: Commit**

```bash
git add src/atoms/mermaid-renderer.ts
git commit -m "refactor: use shared mermaidConfigTag from config"
```

---

### Task 3: Add Mermaid Renderer to Embed Flow

**Files:**
- Modify: `src/flows/embed.ts`
- Test: `src/__tests__/embed.test.ts` (create)

**Step 1: Write the failing test**

Create `src/__tests__/embed.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createTestScope, withTestScope } from "./helpers";
import { embedFlow, EmbedNotSupportedError } from "../flows/embed";
import { diagramStoreAtom } from "../atoms/diagram-store";
import { mermaidConfigTag, type MermaidConfig } from "../config/tags";
import { existsSync, unlinkSync } from "fs";

// Skip if Chrome not available
const CHROME_PATH = process.env.CHROME_PATH;
const describeWithChrome = CHROME_PATH ? describe : describe.skip;

describeWithChrome("embedFlow - mermaid", () => {
  const testDbPath = `/tmp/embed-test-${crypto.randomUUID()}.db`;

  afterAll(() => {
    if (existsSync(testDbPath)) unlinkSync(testDbPath);
  });

  it("renders mermaid diagram to SVG", async () => {
    const mermaidConfig: MermaidConfig = {
      executablePath: CHROME_PATH!,
      dbPath: testDbPath,
      poolSize: 1,
      noSandbox: true,
    };

    await withTestScope({ tags: [mermaidConfigTag(mermaidConfig)] }, async (scope) => {
      const diagramStore = await scope.resolve(diagramStoreAtom);
      const shortlink = diagramStore.create("graph TD; A-->B", "mermaid");

      const ctx = scope.createContext({ tags: [] });
      try {
        const result = await ctx.exec({
          flow: embedFlow,
          input: { shortlink, theme: "light" },
        });

        expect(result.svg).toContain("<svg");
        expect(result.svg).toContain("</svg>");
        expect(result.contentType).toBe("image/svg+xml");
      } finally {
        await ctx.close();
      }
    });
  }, 30000);

  it("rejects dangerous mermaid input", async () => {
    const mermaidConfig: MermaidConfig = {
      executablePath: CHROME_PATH!,
      dbPath: testDbPath,
      poolSize: 1,
      noSandbox: true,
    };

    await withTestScope({ tags: [mermaidConfigTag(mermaidConfig)] }, async (scope) => {
      const diagramStore = await scope.resolve(diagramStoreAtom);
      const shortlink = diagramStore.create('click A "javascript:alert(1)"', "mermaid");

      const ctx = scope.createContext({ tags: [] });
      try {
        await expect(
          ctx.exec({
            flow: embedFlow,
            input: { shortlink, theme: "light" },
          })
        ).rejects.toThrow("forbidden");
      } finally {
        await ctx.close();
      }
    });
  }, 30000);
});
```

**Step 2: Run test to verify it fails**

Run: `CHROME_PATH=/opt/chrome/chrome-headless-shell bun test src/__tests__/embed.test.ts -v`
Expected: FAIL with "mermaidRenderer" not found or similar dependency error

**Step 3: Update embed flow to support mermaid**

Modify `src/flows/embed.ts`:

```typescript
import { flow, tags } from "@pumped-fn/lite";
import { diagramStoreAtom } from "../atoms/diagram-store";
import { d2RendererAtom } from "../atoms/d2-renderer";
import { mermaidRendererAtom } from "../atoms/mermaid-renderer";
import { loggerAtom } from "../atoms/logger";
import { NotFoundError } from "./view";

export interface EmbedInput {
  shortlink: string;
  theme?: "light" | "dark";
}

export interface EmbedOutput {
  svg: string;
  contentType: "image/svg+xml";
}

export class EmbedNotSupportedError extends Error {
  public readonly statusCode = 404;
  constructor(message: string) {
    super(message);
    this.name = "EmbedNotSupportedError";
  }
}

export class EmbedRenderError extends Error {
  public readonly statusCode: number;
  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.name = "EmbedRenderError";
    this.statusCode = statusCode;
  }
}

function parseEmbedInput(input: unknown): EmbedInput {
  if (!input || typeof input !== "object") {
    throw new NotFoundError("Invalid request");
  }

  const obj = input as Record<string, unknown>;

  if (typeof obj.shortlink !== "string" || obj.shortlink.trim() === "") {
    throw new NotFoundError("shortlink is required");
  }

  let theme: "light" | "dark" = "light";
  if (obj.theme === "dark") {
    theme = "dark";
  }

  return { shortlink: obj.shortlink, theme };
}

export const embedFlow = flow({
  name: "embed",
  deps: {
    diagramStore: diagramStoreAtom,
    d2Renderer: d2RendererAtom,
    mermaidRenderer: tags.optional(mermaidRendererAtom),
    logger: loggerAtom,
  },
  parse: (raw: unknown) => parseEmbedInput(raw),
  factory: async (ctx, { diagramStore, d2Renderer, mermaidRenderer, logger }): Promise<EmbedOutput> => {
    const { input } = ctx;

    logger.debug({ shortlink: input.shortlink, theme: input.theme }, "Embedding diagram");

    const diagram = diagramStore.get(input.shortlink);

    if (!diagram) {
      logger.debug({ shortlink: input.shortlink }, "Diagram not found");
      throw new NotFoundError("Diagram not found");
    }

    // Update access time for retention
    diagramStore.touch(input.shortlink);

    let svg: string;

    if (diagram.format === "d2") {
      try {
        svg = await d2Renderer.render(diagram.source, input.theme ?? "light");
      } catch (err) {
        logger.error({ shortlink: input.shortlink, error: err }, "D2 render failed");
        throw new EmbedRenderError(`D2 render failed: ${(err as Error).message}`);
      }
    } else if (diagram.format === "mermaid") {
      if (!mermaidRenderer) {
        logger.debug({ shortlink: input.shortlink }, "Mermaid SSR not available");
        throw new EmbedNotSupportedError("Mermaid SSR not configured. Set CHROME_PATH environment variable.");
      }
      try {
        svg = await mermaidRenderer.render(diagram.source);
      } catch (err) {
        const message = (err as Error).message;
        logger.error({ shortlink: input.shortlink, error: err }, "Mermaid render failed");

        // Map specific errors to appropriate status codes
        if (message.includes("forbidden")) {
          throw new EmbedRenderError(message, 400);
        }
        if (message.includes("queue full")) {
          throw new EmbedRenderError("Service busy, try again later", 503);
        }
        if (message.includes("timeout")) {
          throw new EmbedRenderError("Render timeout", 504);
        }
        throw new EmbedRenderError(`Mermaid render failed: ${message}`);
      }
    } else {
      throw new EmbedNotSupportedError(`Unsupported format: ${diagram.format}`);
    }

    logger.debug({ shortlink: input.shortlink, format: diagram.format }, "Generated embed SVG");

    return {
      svg,
      contentType: "image/svg+xml",
    };
  },
});
```

**Step 4: Run test to verify it passes**

Run: `CHROME_PATH=/opt/chrome/chrome-headless-shell bun test src/__tests__/embed.test.ts -v`
Expected: PASS

**Step 5: Commit**

```bash
git add src/flows/embed.ts src/__tests__/embed.test.ts
git commit -m "feat: add mermaid SSR support to embed flow"
```

---

### Task 4: Update Create Flow to Return Embed URL for Mermaid

**Files:**
- Modify: `src/flows/create.ts:72-75`
- Test: Existing tests should still pass

**Step 1: Write the failing test**

Add to existing test file or create `src/__tests__/create.test.ts`:

```typescript
import { describe, it, expect } from "bun:test";
import { withTestScope } from "./helpers";
import { createFlow } from "../flows/create";
import { baseUrlTag, requestOriginTag } from "../config/tags";

describe("createFlow", () => {
  it("returns embed URL for mermaid diagrams", async () => {
    await withTestScope({ tags: [baseUrlTag("https://example.com")] }, async (scope) => {
      const ctx = scope.createContext({ tags: [requestOriginTag("https://example.com")] });
      try {
        const result = await ctx.exec({
          flow: createFlow,
          rawInput: { source: "graph TD; A-->B", format: "mermaid" },
        });

        expect(result.shortlink).toBeDefined();
        expect(result.url).toContain("/d/");
        expect(result.embed).toContain("/e/");
      } finally {
        await ctx.close();
      }
    });
  });

  it("returns embed URL for d2 diagrams", async () => {
    await withTestScope({ tags: [baseUrlTag("https://example.com")] }, async (scope) => {
      const ctx = scope.createContext({ tags: [requestOriginTag("https://example.com")] });
      try {
        const result = await ctx.exec({
          flow: createFlow,
          rawInput: { source: "A -> B", format: "d2" },
        });

        expect(result.embed).toContain("/e/");
      } finally {
        await ctx.close();
      }
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test src/__tests__/create.test.ts -v`
Expected: FAIL - mermaid result doesn't have embed URL

**Step 3: Update create flow**

Modify `src/flows/create.ts`, change lines 72-75:

```typescript
    // Include embed URL for both D2 and Mermaid (both server-side rendered)
    result.embed = `${baseUrl}/e/${shortlink}`;

    return result;
```

**Step 4: Run test to verify it passes**

Run: `bun test src/__tests__/create.test.ts -v`
Expected: PASS

**Step 5: Commit**

```bash
git add src/flows/create.ts src/__tests__/create.test.ts
git commit -m "feat: return embed URL for mermaid diagrams"
```

---

### Task 5: Add EmbedRenderError Handling to Server

**Files:**
- Modify: `src/server.ts`

**Step 1: Import EmbedRenderError**

Update the import:

```typescript
import { embedFlow, EmbedNotSupportedError, EmbedRenderError } from "./flows/embed";
```

**Step 2: Add EmbedRenderError to mapErrorToResponse**

Add after EmbedNotSupportedError handling:

```typescript
  if (error instanceof EmbedRenderError) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: error.statusCode,
      headers: { "Content-Type": "application/json" },
    });
  }
```

**Step 3: Optionally resolve mermaidRendererAtom at startup for fail-fast**

After resolving diffStore, add:

```typescript
  // Resolve mermaid renderer if configured (fail-fast check)
  const mermaidConfig = scope.data.seekTag(mermaidConfigTag);
  if (mermaidConfig) {
    try {
      await scope.resolve(mermaidRendererAtom);
      logger.info("Mermaid SSR enabled");
    } catch (err) {
      logger.error({ error: err }, "Failed to start mermaid renderer - SSR disabled");
    }
  }
```

Add the required imports:

```typescript
import { mermaidRendererAtom } from "./atoms/mermaid-renderer";
import { mermaidConfigTag } from "./config/tags";
```

**Step 4: Commit**

```bash
git add src/server.ts
git commit -m "feat: add EmbedRenderError handling and mermaid startup check"
```

---

### Task 6: Update Dockerfile to Include Chrome Headless Shell

**Files:**
- Modify: `Dockerfile`
- Delete: `Dockerfile.poc` (merge into main Dockerfile)

**Step 1: Update Dockerfile to merge chrome-headless-shell with existing D2 support**

Replace `Dockerfile` with:

```dockerfile
# Stage 1: Download chrome-headless-shell for mermaid SSR
FROM alpine:3.19 AS chrome-downloader
RUN apk add --no-cache curl unzip
WORKDIR /chrome

ARG CHROME_VERSION=131.0.6778.204
RUN curl -fsSL "https://storage.googleapis.com/chrome-for-testing-public/${CHROME_VERSION}/linux64/chrome-headless-shell-linux64.zip" \
    -o chrome.zip && unzip chrome.zip && rm chrome.zip

# Stage 2: Base with D2 binary
FROM oven/bun:1.3.3-debian AS base

WORKDIR /app

# Install D2 CLI for server-side D2 rendering
RUN apt-get update && apt-get install -y --no-install-recommends curl && \
    D2_VERSION="v0.7.1" && \
    curl -fsSL "https://github.com/terrastruct/d2/releases/download/${D2_VERSION}/d2-${D2_VERSION}-linux-amd64.tar.gz" -o /tmp/d2.tar.gz && \
    tar -xzf /tmp/d2.tar.gz -C /tmp && \
    mv /tmp/d2-${D2_VERSION}/bin/d2 /usr/local/bin/d2 && \
    chmod +x /usr/local/bin/d2 && \
    rm -rf /tmp/d2* && \
    apt-get purge -y curl && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*

# Install Chrome dependencies for mermaid SSR
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpango-1.0-0 \
    libcairo2 \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

# Copy chrome-headless-shell binary
COPY --from=chrome-downloader /chrome/chrome-headless-shell-linux64 /opt/chrome

# Stage 3: Install dependencies
FROM base AS install

COPY package.json bun.lock* ./
# Skip puppeteer browser download - we use embedded chrome-headless-shell
ENV PUPPETEER_SKIP_DOWNLOAD=true
RUN bun install --frozen-lockfile --production

# Stage 4: Release
FROM base AS release

# Copy D2 binary from base
COPY --from=base /usr/local/bin/d2 /usr/local/bin/d2

# Copy chrome-headless-shell from base
COPY --from=base /opt/chrome /opt/chrome

COPY --from=install /app/node_modules ./node_modules
COPY . .

RUN mkdir -p /app/data && \
    chown -R bun:bun /app

ENV NODE_ENV=production
ENV PORT=3000
ENV PUPPETEER_SKIP_DOWNLOAD=true

# Mermaid SSR config - opt-in via environment variable
ENV CHROME_PATH=/opt/chrome/chrome-headless-shell
ENV MERMAID_DB_PATH=/app/data/mermaid-queue.db
# SECURITY: noSandbox is opt-in, not default. Container sandboxing provides isolation.
# Set MERMAID_NO_SANDBOX=true only in properly sandboxed container environments.

EXPOSE 3000

USER bun

CMD ["bun", "run", "src/server.ts"]
```

**Step 2: Remove Dockerfile.poc**

```bash
git rm Dockerfile.poc
```

**Step 3: Build and test**

Run: `docker build -t diashort . && docker run --rm -e MERMAID_NO_SANDBOX=true -p 3000:3000 diashort`

**Step 4: Test mermaid embed endpoint**

```bash
# Create mermaid diagram
SHORTLINK=$(curl -s -X POST http://localhost:3000/render \
  -H "Content-Type: application/json" \
  -d '{"source": "graph TD; A-->B", "format": "mermaid"}' | jq -r .shortlink)

# Get embed (should return SVG)
curl -s http://localhost:3000/e/$SHORTLINK | head -5
```

Expected: Returns `<svg ...` content

**Step 5: Commit**

```bash
git add Dockerfile
git commit -m "feat: merge chrome-headless-shell into Dockerfile for mermaid SSR"
```

---

### Task 7: Update API Documentation

**Files:**
- Modify: `src/server.ts` (usage text)

**Step 1: Update usage text**

In `src/server.ts`, update the usage text for `/e/:shortlink`:

```typescript
### GET /e/:shortlink
Get raw SVG for embedding (D2 and Mermaid).

Use in markdown:
  ![Diagram](${url.origin}/e/abc12345)

Query parameters:
  - theme: "light" (default) or "dark" (D2 only, mermaid uses default theme)

Note: Mermaid SSR requires CHROME_PATH to be configured.
```

Also update the response documentation:

```typescript
Response (D2):
  {"shortlink": "abc12345", "url": "${url.origin}/d/abc12345", "embed": "${url.origin}/e/abc12345"}

Response (Mermaid):
  {"shortlink": "abc12345", "url": "${url.origin}/d/abc12345", "embed": "${url.origin}/e/abc12345"}
```

**Step 2: Commit**

```bash
git add src/server.ts
git commit -m "docs: update API docs for mermaid embed support"
```

---

### Task 8: Run Full Test Suite

**Step 1: Run all tests**

Run: `bun test`
Expected: All tests pass

**Step 2: Run Docker build and verify**

```bash
docker build -t diashort .
docker run --rm -d -e MERMAID_NO_SANDBOX=true -p 3000:3000 --name diashort-verify diashort
sleep 5

# Test D2 embed (should still work)
D2_SHORTLINK=$(curl -s -X POST http://localhost:3000/render \
  -H "Content-Type: application/json" \
  -d '{"source": "A -> B", "format": "d2"}' | jq -r .shortlink)

curl -s http://localhost:3000/e/$D2_SHORTLINK | head -5

# Test mermaid embed
MERMAID_SHORTLINK=$(curl -s -X POST http://localhost:3000/render \
  -H "Content-Type: application/json" \
  -d '{"source": "graph TD; A-->B", "format": "mermaid"}' | jq -r .shortlink)

curl -s http://localhost:3000/e/$MERMAID_SHORTLINK | head -5

docker stop diashort-verify
```

Expected: Both return `<svg ...` content

**Step 3: Final commit if needed**

```bash
git status
# If clean, done. Otherwise commit remaining changes.
```

---

## Summary

After completing all tasks:
- Mermaid diagrams return `embed` URL in create response
- `/e/:shortlink` renders mermaid diagrams to SVG server-side
- Docker image includes both D2 binary and chrome-headless-shell
- Security: noSandbox is opt-in (not default), input validation + securityLevel:strict + output validation
- Proper error code mapping (400 for forbidden, 503 for queue full, 504 for timeout)
- Fail-fast startup check for mermaid renderer when configured

## Codex Review Fixes Applied

1. **High: Preserve D2 support** - Dockerfile now merges chrome-headless-shell with existing D2 binary (Task 6)
2. **High: Circular dependency** - mermaidConfigTag now defined in config/tags.ts, mermaid-renderer.ts imports from there (Tasks 1, 2)
3. **High: Test scaffolding** - Tests use existing `withTestScope` helper with `createContext` + `ctx.exec` + `ctx.close` pattern (Task 3)
4. **Medium: Startup resolution** - Added optional mermaid renderer startup check in server (Task 5)
5. **Medium: Error code mapping** - EmbedRenderError includes statusCode, maps forbidden/queue/timeout appropriately (Tasks 3, 5)
6. **Medium: Security defaults** - noSandbox is opt-in, not default (Tasks 1, 6)
