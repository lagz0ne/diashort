# C3 Documentation Table of Contents

> **AUTO-GENERATED** - Do not edit manually. Rebuild using the c3-toc skill.
>
> Last generated: 2026-02-06 00:00:00

## Context Level

### [c3-0](./README.md) - Diashort
> Diagram shortlink service that stores Mermaid and D2 diagram source code
and serves HTML pages that render client-side. Provides embeddable SVG output
via server-side rendering and side-by-side diagram diff comparison.

---

## Container Level

### [c3-1](./c3-1-api-server/) - API Server
> HTTP service that stores diagram source code and serves HTML pages for
client-side rendering. Also provides embeddable SVG output and diagram diff comparison.

---

### [c3-2](./c3-2-sqlite-db/) - SQLite Database
> Persistent storage for diagram source code and diffs. Single-file database accessed via
Bun's native bun:sqlite module (in-process, no network).

---

## Component Level

### API Server - Foundation

#### [c3-101](./c3-1-api-server/c3-101-bun-server.md) - Bun Server
> HTTP entry point using Bun.serve with routing, auth, and error handling

---

#### [c3-102](./c3-1-api-server/c3-102-di-infrastructure.md) - DI Infrastructure
> @pumped-fn/lite atoms, tags, flows, scopes, and contexts for dependency injection

---

#### [c3-103](./c3-1-api-server/c3-103-config-tags.md) - Config Tags
> Environment-based configuration via @pumped-fn/lite tag system

---

#### [c3-106](./c3-1-api-server/c3-106-logger.md) - Logger
> Pino-based structured logging with configurable level and pretty-print

---

### API Server - Auxiliary

#### [c3-108](./c3-1-api-server/c3-108-error-handling.md) - Error Handling
> Typed error classes with consistent HTTP status code mapping

---

### API Server - Feature

#### [c3-112](./c3-1-api-server/c3-112-diagram-store.md) - Diagram Store
> SQLite CRUD for diagram source storage with retention-based cleanup

---

#### [c3-114](./c3-1-api-server/c3-114-create-flow.md) - Create Flow
> Validate input, store diagram source, return shortlink

---

#### [c3-116](./c3-1-api-server/c3-116-view-flow.md) - View Flow
> Lookup diagram source and generate HTML page for client-side rendering

---

#### [c3-119](./c3-1-api-server/c3-119-html-generator.md) - HTML Generator
> Generate HTML pages with embedded diagram source for client-side rendering

---

#### [c3-120](./c3-1-api-server/c3-120-render-queue.md) - Render Queue
> SQLite-backed job queue for Mermaid server-side rendering with lease-based claiming

---

#### [c3-121](./c3-1-api-server/c3-121-browser-farm.md) - Browser Farm
> Pool of headless Chromium browsers for Mermaid server-side rendering with health checks and crash recovery

---

#### [c3-122](./c3-1-api-server/c3-122-mermaid-renderer.md) - Mermaid Renderer
> DI atom wrapper for Mermaid server-side rendering via browser farm

---

#### [c3-123](./c3-1-api-server/c3-123-embed-flow.md) - Embed Flow
> Render diagram to embeddable SVG via server-side rendering (D2 CLI or Mermaid browser farm)

---

#### [c3-124](./c3-1-api-server/c3-124-d2-renderer.md) - D2 Renderer
> Server-side D2 diagram rendering via d2 CLI subprocess

---

#### [c3-125](./c3-1-api-server/c3-125-diff-store.md) - Diff Store
> SQLite CRUD for diagram diff storage with retention-based cleanup

---

#### [c3-126](./c3-1-api-server/c3-126-diff-viewer.md) - Diff Viewer
> Generate HTML pages for side-by-side diagram comparison with synced zoom/pan

---

#### [c3-127](./c3-1-api-server/c3-127-diff-flow.md) - Diff Flow
> Create and view side-by-side diagram comparisons

---

## Architecture Decisions

### [adr-20260106-client-side-rendering](./adr/adr-20260106-client-side-rendering.md) - Client-Side Diagram Rendering

**Status**: Implemented

---

### [adr-20260122-browser-farm-mermaid-ssr](./adr/adr-20260122-browser-farm-mermaid-ssr.md) - Browser Farm for Server-Side Mermaid Rendering

**Status**: Implemented

---

### [adr-20260200-diagram-diff-comparison](./adr/adr-20260200-diagram-diff-comparison.md) - Diagram Diff Comparison Feature

**Status**: Implemented

---

### [adr-00000000-c3-adoption](./adr/adr-00000000-c3-adoption.md) - C3 Architecture Documentation Adoption

**Status**: Implemented

---

## Quick Reference

**Total Documents**: 24
**Contexts**: 1 | **Containers**: 2 | **Components**: 16 | **ADRs**: 4 (all implemented)
