---
id: c3-0
c3-version: 3
title: Diashort
summary: >
  Diagram shortlink service that stores Mermaid and D2 diagram source code
  and serves HTML pages that render client-side. CDN-cacheable, no server
  rendering overhead.
---

# Diashort

A diagram shortlink service. Users submit diagram source code (Mermaid or D2 format), the service stores it in SQLite and returns a shortlink. Viewing the shortlink serves an HTML page that renders the diagram client-side using Mermaid.js or D2 WASM.

## Overview

```mermaid
flowchart TB
    subgraph Actors
        A1((Developer/<br/>Team))
        A2((Public API<br/>User))
    end

    subgraph Diashort["Diashort System"]
        C1["API Server<br/>c3-1"]
        C2[("SQLite DB<br/>c3-2")]
    end

    subgraph Client["Client Browser"]
        HTML["HTML Page"]
        MermaidJS["Mermaid.js"]
        D2WASM["D2 WASM"]
    end

    A1 -->|"POST /render"| C1
    A1 -->|"GET /d/:id"| C1
    A2 -->|"POST /render"| C1

    C1 -->|"bun:sqlite"| C2
    C1 -->|"serves"| HTML
    HTML --> MermaidJS
    HTML --> D2WASM
```

## Actors

| ID | Actor | Type | Purpose |
|----|-------|------|---------|
| A1 | Developer/Team | user | Share diagrams in documentation, PRs, and chat |
| A2 | Public API User | external-service | Programmatic diagram generation via HTTP API |

## Containers

| ID | Name | Type | Status | Purpose |
|----|------|------|--------|---------|
| c3-1 | API Server | service | active | HTTP service: store diagram source, serve HTML pages with client-side rendering |
| c3-2 | SQLite Database | database | active | Persistent storage for diagram source code |

**Architecture rationale:** Single-instance deployment. All rendering happens client-side, so server is just store/serve. SQLite stores diagram source (tiny, <10KB each). HTML pages are CDN-cacheable.

## External Systems

None. All rendering happens in the client browser using:
- **Mermaid.js** - JavaScript library loaded from CDN
- **D2 WASM** - WebAssembly module bundled with HTML page

## Linkages

```mermaid
flowchart LR
    subgraph Requests
        R1["POST /render"]
        R2["GET /d/:id"]
    end

    subgraph API["API Server (c3-1)"]
        direction TB
        DiagramStore["Diagram Store"]
        HTMLGen["HTML Generator"]
    end

    subgraph Storage["SQLite (c3-2)"]
        Diagrams["diagrams table"]
    end

    R1 -->|"store source"| DiagramStore
    DiagramStore -->|"persist"| Diagrams
    R2 -->|"lookup"| DiagramStore
    DiagramStore -->|"source"| HTMLGen
    HTMLGen -->|"HTML page"| R2
```

| From | To | Protocol | Reasoning |
|------|-----|----------|-----------|
| API Server | SQLite | bun:sqlite | In-process, no network - source persistence |
| Client | Mermaid.js CDN | HTTPS | Standard JS library, cached by browser |
| Client | D2 WASM | bundled | WebAssembly for D2 rendering |

## Cross-Cutting Concerns

| Concern | Implementation |
|---------|----------------|
| Authentication | Optional Basic Auth via `AUTH_ENABLED`, `AUTH_USER`, `AUTH_PASS` env vars |
| Logging | Pino with configurable level, pretty-print in dev |
| Error Handling | Typed errors (`ValidationError`, `NotFoundError`) with HTTP status mapping |
| Configuration | Environment-based via @pumped-fn/lite tags system |
| Caching | HTML pages are CDN-cacheable (immutable content) |
| Cleanup | Diagrams older than retention period (default 30 days) deleted daily |

## E2E Testing Strategy

**Boundaries tested:**
- HTTP API endpoints (create, view)
- Diagram storage and retrieval
- HTML page generation with correct format detection
- Error responses (validation, not found)

**Key user flows:**
1. Submit diagram source → get shortlink → view HTML page
2. View page → browser renders diagram client-side

**Integration proves:**
- SQLite persistence works across restarts
- HTML pages contain correct diagram source
- Mermaid/D2 format detection works
