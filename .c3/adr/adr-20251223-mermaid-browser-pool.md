---
id: adr-20251223-mermaid-browser-pool
title: Replace mmdc CLI with Puppeteer Browser Pool
status: accepted
date: 2025-12-23
---

# Replace mmdc CLI with Puppeteer Browser Pool

## Status
**Accepted** - 2025-12-23

## Problem/Requirement

Current mermaid rendering is slow because each render request spawns a new `mmdc` subprocess, which in turn launches a fresh Chromium/Puppeteer instance. This cold-start penalty (~2-5 seconds per render) makes the existing queue ineffective - requests wait in queue but don't benefit from instance reuse.

The queue (c3-106) limits concurrency but doesn't help throughput because there's no pool of warm instances to dispatch work to.

## Exploration Journey

**Initial hypothesis:** The "mermaid warm-up" slowness is the Chromium cold-start happening on every request.

**Explored:**
- c3-107 (Renderer) - Spawns `mmdc` as subprocess via `Bun.spawn()`
- c3-106 (Queue) - Limits concurrent renders to 10 by default
- mermaid-cli programmatic API - `renderMermaid()` accepts external browser instance

**Discovered:**
- mermaid-cli exposes `renderMermaid(browser, definition, outputFormat, opts)` function
- Browser can be passed in, enabling instance reuse
- Libraries like [puppeteer-cluster](https://github.com/thomasdondorf/puppeteer-cluster) and [browser-pool](https://www.npmjs.com/package/browser-pool) exist for managing browser pools
- Scope is confined to c3-107 (Renderer) with new dependencies at container level

## Solution

Switch from CLI subprocess to **programmatic API with browser pool**:

1. **Add dependencies:**
   - `@mermaid-js/mermaid-cli` - For `renderMermaid()` function
   - `puppeteer` - Peer dependency of mermaid-cli

2. **Create Browser Pool component:**
   - Pool of N Puppeteer browser instances (N = QUEUE_MAX_CONCURRENT)
   - Pre-launched at server startup (warm pool)
   - Instances checked out for render, returned after completion
   - Health monitoring and instance recycling on errors

3. **Modify Renderer (c3-107):**
   - Replace `Bun.spawn(['mmdc', ...])` with `renderMermaid(browser, ...)`
   - Acquire browser from pool, render, release back to pool
   - Temp file management shifts to in-memory handling

4. **Coordinate with Queue (c3-106):**
   - Pool size matches `QUEUE_MAX_CONCURRENT`
   - Queue limits requests; pool limits actual browser instances
   - Both configured from same env var for consistency

### Architecture Diagram

```
Before:
Request → Queue → spawn mmdc → [new Chromium] → render → exit

After:
                    ┌──────────────────────────┐
Startup → warmPool → │ Browser Pool (N instances) │
                    └──────────────────────────┘
                              ↓ acquire
Request → Queue → renderMermaid(browser) → release back to pool
```

## Alternatives Considered

| Alternative | Rejected Because |
|-------------|------------------|
| Keep CLI, add process pool | mmdc exits after each run, can't reuse processes |
| Use puppeteer-cluster directly | Adds complexity; simple pool is sufficient for our use case |
| External browser service (browserless.io) | Adds external dependency, network latency |

## Changes Across Layers

### Context Level
- c3-0: No changes to actors or container boundaries

### Container Level
- c3-1-api-server: Add dependencies `@mermaid-js/mermaid-cli`, `puppeteer`

### Component Level
- c3-107-renderer: **Major rewrite** - Replace subprocess spawning with programmatic API + pool
- c3-106-queue: **Minor** - Consider exposing pool size config; may share config with pool
- **New: c3-113-browser-pool**: Browser instance lifecycle management

## Verification

- [ ] First mermaid render completes in <500ms (warm pool eliminates cold start)
- [ ] 10 concurrent requests process in parallel (not serialized by cold starts)
- [ ] Memory usage stable under sustained load (no browser leaks)
- [ ] Graceful shutdown disposes all browser instances

## Implementation Plan

### Code Changes

| Layer Change | Code Location | Action | Details |
|--------------|---------------|--------|---------|
| Add dependencies | package.json | Edit | Add `@mermaid-js/mermaid-cli`, `puppeteer` |
| Browser Pool atom | src/atoms/browser-pool.ts | Create | Pool of Puppeteer instances with acquire/release |
| Renderer rewrite | src/atoms/renderer.ts | Edit | Replace spawn logic with renderMermaid() + pool |
| Config | src/config/tags.ts | Edit | Add POOL_SIZE tag (defaults to QUEUE_MAX_CONCURRENT) |
| Startup warm-up | src/server.ts | Edit | Pre-warm pool before accepting requests |
| C3 docs | .c3/c3-1-api-server/c3-113-browser-pool.md | Create | Document new component |
| Update renderer docs | .c3/c3-1-api-server/c3-107-renderer.md | Edit | Reflect new architecture |

### Acceptance Criteria

| Verification Item | Criterion | How to Test |
|-------------------|-----------|-------------|
| Cold start eliminated | First render <500ms after startup | Time first request after server start |
| Pool reuse working | 100 sequential renders don't spawn 100 Chromium | Monitor process count during load test |
| Concurrent throughput | 10 parallel renders complete faster than 10 serial | Benchmark parallel vs serial |
| Error recovery | Browser crash triggers replacement | Kill a browser process, verify pool recovers |
| Graceful shutdown | No orphan Chromium processes after server stop | Check process list after shutdown |

## Related

- [c3-107 Renderer](.c3/c3-1-api-server/c3-107-renderer.md) - Component being rewritten
- [c3-106 Queue](.c3/c3-1-api-server/c3-106-queue.md) - Coordinates with pool
- [Rendering Engine | mermaid-cli](https://deepwiki.com/mermaid-js/mermaid-cli/3.3-rendering-engine) - External docs on renderMermaid API
