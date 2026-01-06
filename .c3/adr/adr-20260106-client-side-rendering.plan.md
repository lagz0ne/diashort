# Implementation Plan: Client-Side Diagram Rendering

**ADR:** adr-20260106-client-side-rendering
**Status:** Accepted

## Pre-Execution Checklist

- [ ] Read current implementation files before modifying
- [ ] Backup/commit current state before starting
- [ ] Update C3 docs BEFORE code changes

---

## Phase 1: Documentation Updates (C3 First)

### 1.1 Update Context (c3-0)
- [ ] Edit `.c3/README.md`:
  - Remove Actor A3 (CLI User)
  - Remove External Systems E1, E2, E3
  - Update system diagram
  - Update cross-cutting concerns (remove backpressure, queue)
  - Update E2E testing strategy

### 1.2 Update Container c3-1
- [ ] Edit `.c3/c3-1-api-server/README.md`:
  - Remove components: c3-104, c3-105, c3-107, c3-109, c3-110, c3-111, c3-113, c3-115, c3-117, c3-118
  - Modify components: c3-112, c3-114, c3-116
  - Add component: c3-119
  - Update diagrams
  - Update fulfillment table

### 1.3 Update Container c3-2
- [ ] Edit `.c3/c3-2-sqlite-db/README.md`:
  - Update schema (jobs → diagrams)
  - Update access patterns
  - Update data lifecycle

### 1.4 Delete Removed Component Docs
- [ ] Delete: `c3-104-queue.md`
- [ ] Delete: `c3-105-cache.md`
- [ ] Delete: `c3-107-browser-pool.md`
- [ ] Keep c3-108 (error handling - still used)

### 1.5 Update/Create Component Docs
- [ ] Edit `c3-112-job-store.md` → rename to `c3-112-diagram-store.md`
- [ ] Edit `c3-114-render-flow.md` → update to Create Flow
- [ ] Create `c3-119-html-generator.md`

---

## Phase 2: Code Deletion (Remove Unused)

### 2.1 Delete Atom Files
```bash
rm src/atoms/queue.ts
rm src/atoms/cache.ts
rm src/atoms/browser-pool.ts
rm src/atoms/renderer.ts
rm src/atoms/mermaid-renderer.ts
rm src/atoms/terminal-renderer.ts
rm src/atoms/job-processor.ts
```

### 2.2 Delete Flow Files
```bash
rm src/flows/render-async.ts
rm src/flows/job-status.ts
rm src/flows/render-terminal.ts
```

### 2.3 Delete Test Files
```bash
rm src/__tests__/queue.test.ts
rm src/__tests__/cache.test.ts
rm src/__tests__/browser-pool.test.ts
rm src/__tests__/renderer.test.ts
rm src/__tests__/mermaid-renderer.test.ts
rm src/__tests__/terminal-renderer.test.ts
rm src/__tests__/job-processor.test.ts
rm src/__tests__/render-async.test.ts
rm src/__tests__/job-status.test.ts
rm src/__tests__/render-terminal.test.ts
```

---

## Phase 3: Code Modification

### 3.1 Update Config Tags (`src/config/tags.ts`)
- [ ] Remove tags: queueConfigTag, cacheConfigTag, browserPoolSizeTag, chafaPathTag, jobConfigTag (poll/retention)
- [ ] Add tags: diagramRetentionDaysTag, cleanupIntervalMsTag
- [ ] Update loadConfigTags() function

### 3.2 Transform Job Store → Diagram Store (`src/atoms/job-store.ts`)
- [ ] Rename file to `diagram-store.ts`
- [ ] Change schema: jobs → diagrams table
- [ ] Remove status workflow (pending/rendering/completed/failed)
- [ ] Add: create(source, format) → shortlink
- [ ] Add: get(shortlink) → {source, format} | null
- [ ] Add: touch(shortlink) → update accessedAt
- [ ] Add: cleanup() → delete old by accessedAt

### 3.3 Transform Render Flow → Create Flow (`src/flows/render.ts`)
- [ ] Remove queue dependency
- [ ] Remove cache dependency
- [ ] Remove renderer dependency
- [ ] Input: {source, format}
- [ ] Output: {shortlink, url}
- [ ] Logic: validate → store in DiagramStore → return shortlink

### 3.4 Transform Retrieve Flow → View Flow (`src/flows/retrieve.ts`)
- [ ] Remove cache dependency
- [ ] Add DiagramStore dependency
- [ ] Add HTML generator dependency
- [ ] Input: {shortlink}
- [ ] Output: {html, contentType: "text/html"}
- [ ] Logic: lookup source → generate HTML page → return

### 3.5 Create HTML Generator (`src/atoms/html-generator.ts`)
- [ ] Create atom for HTML page generation
- [ ] Template with:
  - Mermaid.js CDN import (for mermaid format)
  - D2 WASM loader (for d2 format)
  - Embedded diagram source
  - LocalStorage caching logic
  - Responsive styling

### 3.6 Update Server (`src/server.ts`)
- [ ] Remove imports: queue, cache, browserPool, jobProcessor, asyncRenderFlow, jobStatusFlow, renderTerminalFlow, ChafaError
- [ ] Remove routes: GET /jobs/:id, POST /render/terminal
- [ ] Simplify POST /render (no mode param, no async)
- [ ] Change GET /d/:id to return HTML (text/html)
- [ ] Remove browser pool warmup
- [ ] Remove job processor startup
- [ ] Update error mapping (remove BackpressureError, ChafaError)
- [ ] Start cleanup interval for old diagrams

---

## Phase 4: Dockerfile Updates

### 4.1 Simplify Dockerfile
- [ ] Remove: chromium installation
- [ ] Remove: d2 CLI installation
- [ ] Remove: chafa installation
- [ ] Remove: PUPPETEER_* env vars
- [ ] Remove: mermaid-cli global install
- [ ] Result: Much smaller image (just Bun + app)

---

## Phase 5: New Tests

### 5.1 Update Existing Tests
- [ ] Update `src/__tests__/setup.test.ts` if needed
- [ ] Update integration tests

### 5.2 Create New Tests
- [ ] `src/__tests__/diagram-store.test.ts`
- [ ] `src/__tests__/html-generator.test.ts`
- [ ] `src/__tests__/create-flow.test.ts` (rename from render)
- [ ] `src/__tests__/view-flow.test.ts` (rename from retrieve)

---

## Phase 6: Verification

### 6.1 Functional Tests
```bash
# Start server
bun run dev

# Create diagram
curl -X POST http://localhost:3000/render \
  -H "Content-Type: application/json" \
  -d '{"source": "graph TD; A-->B;", "format": "mermaid"}'

# View diagram (should return HTML)
curl http://localhost:3000/d/{shortlink}

# Verify old endpoints are gone
curl http://localhost:3000/jobs/test  # Should 404
curl -X POST http://localhost:3000/render/terminal  # Should 404
```

### 6.2 Run Test Suite
```bash
bun test
```

### 6.3 Docker Build
```bash
docker build -t diashort:client-render .
docker images diashort:client-render  # Check size reduction
```

### 6.4 C3 Audit
```bash
# Run /c3 audit to verify docs match code
```

---

## Rollback Plan

If issues arise:
1. Git revert to pre-implementation commit
2. Restore deleted files from git history
3. Document lessons learned in ADR

---

## Completion Checklist

- [ ] All Phase 1 docs updated
- [ ] All Phase 2 files deleted
- [ ] All Phase 3 code modified
- [ ] Phase 4 Dockerfile updated
- [ ] All Phase 5 tests pass
- [ ] Phase 6 verification complete
- [ ] ADR status updated to `implemented`
- [ ] TOC regenerated
