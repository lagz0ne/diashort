---
id: c3-1
c3-version: 3
title: API Server
type: container
parent: c3-0
summary: >
  HTTP service that stores diagram source code and serves HTML pages for
  client-side rendering. Minimal server logic - just store/serve.
---

# API Server

HTTP service built on Bun.serve. Accepts diagram source code, stores in SQLite, returns shortlink. Serves HTML pages that render diagrams client-side using Mermaid.js or D2 WASM.

## Overview

```mermaid
flowchart TB
    subgraph Entry["Entry Point"]
        Server["Bun Server<br/>c3-101"]
    end

    subgraph Foundation["Foundation"]
        DI["DI Infrastructure<br/>c3-102"]
        Config["Config Tags<br/>c3-103"]
        Logger["Logger<br/>c3-106"]
    end

    subgraph Auxiliary["Auxiliary"]
        ErrorMap["Error Handling<br/>c3-108"]
    end

    subgraph Storage["Storage"]
        DiagramStore["Diagram Store<br/>c3-112"]
    end

    subgraph Generation["Generation"]
        HTMLGen["HTML Generator<br/>c3-119"]
    end

    subgraph Flows["Flows"]
        CreateFlow["Create Flow<br/>c3-114"]
        ViewFlow["View Flow<br/>c3-116"]
    end

    Server --> DI
    Server --> ErrorMap
    DI --> Config

    CreateFlow --> DiagramStore
    CreateFlow --> Logger

    ViewFlow --> DiagramStore
    ViewFlow --> HTMLGen
    ViewFlow --> Logger
```

## Components

### Foundation
> Primitives others build on. High impact when changed.

| ID | Name | Status | Responsibility |
|----|------|--------|----------------|
| c3-101 | Bun Server | active | HTTP entry point, routing, request/response handling |
| c3-102 | DI Infrastructure | active | @pumped-fn/lite atoms, tags, flows, scopes, contexts |
| c3-103 | Config Tags | active | Environment-based configuration via tag system |
| c3-106 | Logger | active | Pino-based structured logging |

### Auxiliary
> Conventions for using external tools. "How we use X here."

| ID | Name | Status | Responsibility |
|----|------|--------|----------------|
| c3-108 | Error Handling | active | Typed error classes with HTTP status code mapping |

### Feature
> Domain-specific. Uses Foundation + Auxiliary.

| ID | Name | Status | Responsibility |
|----|------|--------|----------------|
| c3-112 | Diagram Store | active | SQLite CRUD for diagram source storage |
| c3-114 | Create Flow | active | Validate input → store source → return shortlink |
| c3-116 | View Flow | active | Lookup source → generate HTML page |
| c3-119 | HTML Generator | active | Generate HTML pages with Mermaid.js/D2 WASM |

## Fulfillment

| Link (from c3-0) | Fulfilled By | Constraints |
|------------------|--------------|-------------|
| POST /render | c3-101 → c3-114 | Auth if enabled |
| GET /d/:id | c3-101 → c3-116 | No auth, CDN-cacheable |
| SQLite integration | c3-112 | via c3-2 container |

## Linkages

```mermaid
flowchart LR
    subgraph Request["HTTP Request"]
        R["Bun.serve"]
    end

    subgraph Create["POST /render"]
        CF["Create Flow"]
        DS["Diagram Store"]
    end

    subgraph View["GET /d/:id"]
        VF["View Flow"]
        HG["HTML Generator"]
    end

    R -->|"POST"| CF
    CF -->|"store"| DS

    R -->|"GET"| VF
    VF -->|"lookup"| DS
    DS -->|"source"| HG
    HG -->|"HTML"| VF
```

| From | To | Reasoning |
|------|-----|-----------|
| Bun Server → Flows | DI context | Each request creates isolated execution context |
| Create Flow → Diagram Store | Persistence | Source survives restarts |
| View Flow → HTML Generator | Rendering | Client-side rendering via JS/WASM |

## Testing Strategy

**Integration scope:**
- Flow-level tests for create/view
- Diagram store CRUD operations
- HTML generator output validation

**Mocking approach:**
- Flows can be executed with custom scopes/tags
- In-memory SQLite for tests

**Fixtures:**
- Valid Mermaid/D2 source strings
- Invalid input for validation tests
