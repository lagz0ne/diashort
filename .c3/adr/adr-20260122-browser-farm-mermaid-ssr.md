---
id: adr-20260122-browser-farm-mermaid-ssr
c3-version: 3
title: Browser Farm for Server-Side Mermaid Rendering
type: adr
status: accepted
date: 2026-01-22
affects: [c3-0, c3-1]
base-commit: de1d42f0573b40783ff477cae566d7671bfaf471
approved-files:
  - src/atoms/render-queue.ts
  - src/atoms/browser-farm.ts
  - src/atoms/mermaid-renderer.ts
  - src/flows/embed.ts
  - src/config/tags.ts
  - src/server.ts
  - src/__tests__/render-queue.test.ts
  - src/__tests__/browser-farm.test.ts
  - src/__tests__/integration.test.ts
  - docs/plans/2026-01-22-browser-farm-mermaid-renderer.md
---

# Browser Farm for Server-Side Mermaid Rendering

## Status

**Accepted** - 2026-01-22

## Problem

| Situation | Impact |
|-----------|--------|
| Mermaid diagrams render client-side only | No embeddable SVG output for `/e/:shortlink` endpoint |
| D2 has server-side rendering via CLI | Mermaid lacks equivalent - asymmetric API surface |
| Use case: embed Mermaid SVGs in markdown/docs | Currently returns 404 with "Mermaid not supported" |
| Mermaid.js requires DOM/browser context | Cannot use simple CLI approach like D2 |

**Current behavior (from `src/flows/embed.ts`):**

```typescript
if (diagram.format !== "d2") {
  throw new EmbedNotSupportedError(
    "Embedding is only supported for D2 diagrams. Mermaid diagrams require client-side rendering."
  );
}
```

## Decision Drivers

- Enable embeddable SVG output for Mermaid diagrams
- Maintain existing client-side rendering path (additive, not replacement)
- Keep D2 rendering unchanged (continues using `d2` CLI)
- Predictable resource usage with configurable pool size
- Simple synchronous request/response model

## Decision

**Add server-side Mermaid rendering via a browser farm.**

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Request Flow                          │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  GET /e/:shortlink                                       │
│         │                                                │
│         ▼                                                │
│  ┌─────────────┐    ┌──────────────┐                    │
│  │ embed flow  │───▶│ diagram-store │                   │
│  └─────────────┘    └──────────────┘                    │
│         │                                                │
│         ▼                                                │
│  ┌─────────────────────────────────────────────┐        │
│  │              Format Check                    │        │
│  │  ┌─────────────────┬─────────────────────┐  │        │
│  │  │   format: d2    │   format: mermaid   │  │        │
│  │  │        │        │          │          │  │        │
│  │  │        ▼        │          ▼          │  │        │
│  │  │  d2-renderer    │  mermaid-renderer   │  │        │
│  │  │  (d2 CLI)       │  (browser-farm)     │  │        │
│  │  └─────────────────┴─────────────────────┘  │        │
│  └─────────────────────────────────────────────┘        │
│         │                                                │
│         ▼                                                │
│      SVG Response                                        │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### Components

1. **render-queue.ts** - SQLite-backed job queue
   - Persistent job storage for crash recovery
   - Status tracking: pending, processing, completed, failed
   - Timeout handling with configurable TTL (30s default)

2. **browser-farm.ts** - Browser pool manager
   - Configurable pool size (default: 2 browsers)
   - Headless Chromium via Playwright/Puppeteer
   - Health checks and browser recycling
   - ~200-300MB memory per browser instance

3. **mermaid-renderer.ts** - DI atom wrapper
   - Wraps browser-farm for @pumped-fn/lite DI
   - Consistent interface with d2-renderer
   - Retry logic (up to 2x on failure)

### Behavior

| Aspect | Implementation |
|--------|----------------|
| Execution model | Synchronous - request waits for result |
| Timeout | 30 seconds TTL per render |
| Retry | Up to 2 retries on failure |
| Pool size | Default 2, configurable via `BROWSER_POOL_SIZE` |
| Memory | ~200-300MB per browser |
| Failure | Return 503 Service Unavailable |
| Fallback | None - fail fast, no client-side redirect |

### Why No Fallback?

Considered and rejected returning HTML page on render failure:

1. **Contract violation**: `/e/` promises SVG, returning HTML breaks consumers
2. **Silent degradation**: Markdown embeds would show broken images vs explicit error
3. **Debugging difficulty**: Harder to diagnose intermittent failures
4. **503 is correct**: Tells client "try again later" - standard retry semantics

## Rationale

| Consideration | Decision |
|---------------|----------|
| Why browser farm? | Mermaid.js needs DOM - no pure-Node.js renderer exists |
| Why not mermaid-cli? | It uses Puppeteer internally anyway - direct control is better |
| Why SQLite queue? | Crash recovery, simpler than Redis for single-instance |
| Why synchronous? | Simpler API, no polling needed, matches D2 behavior |
| Pool size default | 2 browsers balance memory (~600MB) vs throughput |

### Alternatives Rejected

| Option | Rejected Because |
|--------|------------------|
| Client-side only | Cannot embed in markdown, GitHub, etc. |
| External service | Adds dependency, latency, cost |
| WebAssembly Mermaid | Doesn't exist - Mermaid.js is browser-only |
| Node canvas rendering | Mermaid doesn't support it |
| Larger default pool | Memory overhead for typical usage |

## Affected Layers

| Layer | Document | Change |
|-------|----------|--------|
| Context | c3-0 | Add browser farm to external systems |
| API Server | c3-1 | Add browser-farm, render-queue, mermaid-renderer atoms |
| Embed Flow | c3-116 | Modify to support Mermaid format |

### New Components

| ID | Name | Type | Purpose |
|----|------|------|---------|
| c3-120 | Render Queue | atom | SQLite-backed job queue for render jobs |
| c3-121 | Browser Farm | atom | Pool of headless browsers for rendering |
| c3-122 | Mermaid Renderer | atom | DI wrapper for Mermaid SSR via browser farm |

## Approved Files

The following files are approved for modification under this ADR:

```yaml
approved-files:
  # New atoms
  - src/atoms/render-queue.ts
  - src/atoms/browser-farm.ts
  - src/atoms/mermaid-renderer.ts

  # Modified existing
  - src/flows/embed.ts          # Add mermaid support
  - src/config/tags.ts          # Add BROWSER_POOL_SIZE config
  - src/server.ts               # Update usage docs

  # Tests
  - src/__tests__/render-queue.test.ts
  - src/__tests__/browser-farm.test.ts
  - src/__tests__/integration.test.ts

  # Documentation
  - docs/plans/2026-01-22-browser-farm-mermaid-renderer.md
```

**Gate behavior:** Only these files can be edited when status is `accepted`.

## Configuration

New environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `BROWSER_POOL_SIZE` | `2` | Number of browser instances in pool |
| `RENDER_TIMEOUT_MS` | `30000` | Max time for single render |
| `RENDER_MAX_RETRIES` | `2` | Retry attempts on failure |

## API Changes

| Endpoint | Before | After | Breaking? |
|----------|--------|-------|-----------|
| GET /e/:shortlink (mermaid) | 404 "not supported" | 200 SVG | No - was error |
| GET /e/:shortlink (d2) | 200 SVG | 200 SVG (unchanged) | No |
| GET /e/:shortlink (failure) | N/A | 503 | No - new behavior |

## Consequences

### Positive

- Mermaid diagrams embeddable in markdown/docs
- Consistent API surface with D2
- Predictable resource usage with pool limits
- Crash recovery via SQLite queue
- No breaking changes to existing endpoints

### Negative

- Memory overhead: ~200-300MB per browser
- Docker image grows (needs Chromium)
- Cold start slower (browser pool initialization)
- Additional dependency: Playwright or Puppeteer

### Mitigations

- Pool size configurable for resource-constrained environments
- Lazy initialization - browsers spawn on first request
- Health checks recycle stuck browsers
- SQLite queue survives restarts

## Verification

- [ ] `GET /e/:shortlink` returns SVG for Mermaid diagrams
- [ ] SVG contains valid rendered diagram (not error state)
- [ ] Theme parameter works (`?theme=dark`)
- [ ] Timeout returns 503 after 30 seconds
- [ ] Retry logic attempts up to 2x on failure
- [ ] Pool respects `BROWSER_POOL_SIZE` configuration
- [ ] D2 rendering unchanged (still uses CLI)
- [ ] Memory stays within expected bounds (~300MB per browser)
- [ ] Integration tests pass for both Mermaid and D2 embed

## References

| Document | Relevance |
|----------|-----------|
| [adr-20260106-client-side-rendering](./adr-20260106-client-side-rendering.md) | Previous decision to remove server-side rendering |
| [c3-1 API Server](../c3-1-api-server/) | Container being modified |
| [embed.ts](../../src/flows/embed.ts) | Flow to be modified |
