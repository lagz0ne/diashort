---
id: c3-0
c3-version: 3
title: Diashort
summary: >
  Diagram shortlink service that stores Mermaid and D2 diagram source code
  and serves HTML pages that render client-side. Provides embeddable SVG output
  via server-side rendering and side-by-side diagram diff comparison.
  CDN-cacheable, minimal server overhead.
---

# Diashort

A diagram shortlink service. Users submit diagram source code (Mermaid or D2 format), the service stores it in SQLite and returns a shortlink. Viewing the shortlink serves an HTML page that renders the diagram client-side using Mermaid.js or D2 WASM. Embeddable SVG output is available via server-side rendering (D2 CLI, Mermaid browser farm). Diagram diffs provide side-by-side comparison with synced zoom/pan.

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
        DiffView["Diff Viewer"]
    end

    subgraph SSR["Server-Side Rendering"]
        D2CLI["d2 CLI"]
        BrowserFarm["Browser Farm<br/>(Chromium + mermaid-cli)"]
    end

    A1 -->|"POST /render"| C1
    A1 -->|"POST /diff"| C1
    A1 -->|"GET /d/:id, /e/:id, /diff/:id"| C1
    A2 -->|"POST /render"| C1

    C1 -->|"bun:sqlite"| C2
    C1 -->|"serves"| HTML
    C1 -->|"D2 embed"| D2CLI
    C1 -->|"Mermaid embed"| BrowserFarm
    HTML --> MermaidJS
    HTML --> D2WASM
    HTML --> DiffView
```

## Actors

| ID | Actor | Type | Purpose |
|----|-------|------|---------|
| A1 | Developer/Team | user | Share diagrams in documentation, PRs, and chat |
| A2 | Public API User | external-service | Programmatic diagram generation via HTTP API |

## Containers

| ID | Name | Type | Status | Purpose |
|----|------|------|--------|---------|
| c3-1 | API Server | service | active | HTTP service: store diagram source, serve HTML pages, render SVG, compare diffs |
| c3-2 | SQLite Database | database | active | Persistent storage for diagram source code, diffs, and render queue |

**Architecture rationale:** Single-instance deployment. Client-side rendering for viewing, server-side rendering for embedding. SQLite stores diagram source (tiny, <10KB each). HTML pages are CDN-cacheable.

## External Systems

| System | Purpose | Required |
|--------|---------|----------|
| **d2 CLI** | Server-side D2 diagram rendering to SVG | Yes (for embed) |
| **Chromium** | Headless browser for Mermaid SSR via browser farm | Optional (CHROME_PATH) |
| **Mermaid.js CDN** | Client-side Mermaid rendering in browser | Yes (loaded by HTML pages) |

## Linkages

```mermaid
flowchart LR
    subgraph Requests
        R1["POST /render"]
        R2["GET /d/:id"]
        R3["GET /e/:id"]
        R4["POST /diff"]
        R5["GET /diff/:id"]
    end

    subgraph API["API Server (c3-1)"]
        direction TB
        DiagramStore["Diagram Store"]
        DiffStore["Diff Store"]
        HTMLGen["HTML Generator"]
        DiffViewer["Diff Viewer"]
        D2Renderer["D2 Renderer"]
        MermaidRenderer["Mermaid Renderer"]
    end

    subgraph Storage["SQLite (c3-2)"]
        Diagrams["diagrams table"]
        Diffs["diagram_diffs table"]
    end

    R1 -->|"store source"| DiagramStore
    DiagramStore -->|"persist"| Diagrams

    R2 -->|"lookup"| DiagramStore
    DiagramStore -->|"source"| HTMLGen
    HTMLGen -->|"HTML page"| R2

    R3 -->|"lookup"| DiagramStore
    DiagramStore -->|"source"| D2Renderer
    DiagramStore -->|"source"| MermaidRenderer

    R4 -->|"store pair"| DiffStore
    DiffStore -->|"persist"| Diffs

    R5 -->|"lookup"| DiffStore
    DiffStore -->|"sources"| DiffViewer
    DiffViewer -->|"HTML page"| R5
```

| From | To | Protocol | Reasoning |
|------|-----|----------|-----------|
| API Server | SQLite | bun:sqlite | In-process, no network - source persistence |
| API Server | d2 CLI | subprocess | SVG rendering for D2 diagrams |
| API Server | Chromium | CDP (WebSocket) | Mermaid SSR via browser farm |
| Client | Mermaid.js CDN | HTTPS | Standard JS library, cached by browser |

## Cross-Cutting Concerns

| Concern | Implementation |
|---------|----------------|
| Authentication | Optional Basic Auth via `AUTH_ENABLED`, `AUTH_USER`, `AUTH_PASS` env vars |
| Logging | Pino with configurable level, pretty-print in dev |
| Error Handling | Typed errors with HTTP status mapping (c3-108) |
| Configuration | Environment-based via @pumped-fn/lite tags system (c3-103) |
| Caching | HTML/SVG pages are CDN-cacheable (immutable content) |
| Cleanup | Diagrams/diffs older than retention period (default 30 days) deleted daily |
| Security | Input sanitization, output validation, SSRF prevention in browser farm |

## E2E Testing Strategy

**Boundaries tested:**
- HTTP API endpoints (create, view, embed, diff)
- Diagram and diff storage and retrieval
- HTML page generation with correct format detection
- SVG embedding for D2 and Mermaid
- Error responses (validation, not found)

**Key user flows:**
1. Submit diagram source -> get shortlink -> view HTML page
2. Submit diagram source -> get embed URL -> get SVG
3. Submit before/after pair -> get diff shortlink -> view comparison
4. View page -> browser renders diagram client-side

**Integration proves:**
- SQLite persistence works across restarts
- HTML pages contain correct diagram source
- SVG output is valid and sanitized
- Mermaid/D2 format detection works
