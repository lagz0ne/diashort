# C3 Documentation Table of Contents

> **AUTO-GENERATED** - Do not edit manually. Rebuild using the c3-toc skill.
>
> Last generated: 2026-01-15 17:29:53

## Context Level

### [c3-0](./README.md) - Diashort
> Diagram shortlink service that stores Mermaid and D2 diagram source code
and serves HTML pages that render client-side. CDN-cacheable, no server
rendering overhead.

**Sections**:

---

## Container Level

### [c3-1](./c3-1-api-server/) - API Server
> HTTP service that stores diagram source code and serves HTML pages for
client-side rendering. Minimal server logic - just store/serve.

**Sections**:

---

### [c3-2](./c3-2-sqlite-db/) - SQLite Database
> Persistent storage for diagram source code. Single-file database accessed via
Bun's native bun:sqlite module (in-process, no network).

**Sections**:

---

## Component Level

### API Server Components

#### [c3-101](./c3-1-api-server/c3-101-bun-server.md) - Bun Server
> HTTP entry point using Bun.serve with routing, auth, and error handling

**Sections**:

---

#### [c3-108](./c3-1-api-server/c3-108-error-handling.md) - Error Handling
> Typed error classes with consistent HTTP status code mapping

**Sections**:

---

#### [c3-112](./c3-1-api-server/c3-112-diagram-store.md) - Diagram Store
> SQLite CRUD for diagram source storage with retention-based cleanup

**Sections**:

---

#### [c3-114](./c3-1-api-server/c3-114-create-flow.md) - Create Flow
> Validate input, store diagram source, return shortlink

**Sections**:

---

#### [c3-116](./c3-1-api-server/c3-116-view-flow.md) - View Flow
> Lookup diagram source and generate HTML page for client-side rendering

**Sections**:

---

#### [c3-119](./c3-1-api-server/c3-119-html-generator.md) - HTML Generator
> Generate HTML pages with embedded diagram source for client-side rendering

**Sections**:

---

## Architecture Decisions

### [adr-20260106-client-side-rendering](./adr/adr-20260106-client-side-rendering.md) - Client-Side Diagram Rendering
> 

**Status**: Implemented

**Sections**:

---

### [adr-00000000-c3-adoption](./adr/adr-00000000-c3-adoption.md) - C3 Architecture Documentation Adoption
> 

**Status**: Implemented

**Sections**:

---

## Quick Reference

**Total Documents**: 11
**Contexts**: 1 | **Containers**: 2 | **Components**: 6 | **ADRs**: 2 (implemented)
