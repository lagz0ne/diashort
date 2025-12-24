---
c3-version: 3
title: Diashort Architecture - Table of Contents
---

# Diashort Architecture

## Context

- [c3-0 - Diashort Overview](README.md) - System overview, actors, containers, cross-cutting concerns

## Containers

### c3-1 - API Server

- [c3-1 - API Server](c3-1-api-server/README.md) - HTTP service for diagram rendering and retrieval

#### Components

**Infrastructure**
| ID | Name | Summary |
|----|------|---------|
| [c3-101](c3-1-api-server/c3-101-bun-server.md) | Bun Server | Server lifecycle, routing, auth, error mapping |
| [c3-102](c3-1-api-server/c3-102-di-infrastructure.md) | DI Infrastructure | @pumped-fn/lite patterns |
| [c3-108](c3-1-api-server/c3-108-config.md) | Config | Environment-based configuration |
| [c3-109](c3-1-api-server/c3-109-logger.md) | Logger | Pino logging |

**Business Logic**
| ID | Name | Summary |
|----|------|---------|
| [c3-103](c3-1-api-server/c3-103-render-flow.md) | Render Flow | Orchestrates diagram rendering |
| [c3-104](c3-1-api-server/c3-104-retrieve-flow.md) | Retrieve Flow | Fetches cached diagrams |
| [c3-112](c3-1-api-server/c3-112-job-flow.md) | Job Flow | Job status lookup |

**Services**
| ID | Name | Summary |
|----|------|---------|
| [c3-105](c3-1-api-server/c3-105-cache.md) | Cache | In-memory storage with TTL |
| [c3-106](c3-1-api-server/c3-106-queue.md) | Queue | Backpressure control |
| [c3-107](c3-1-api-server/c3-107-renderer.md) | Renderer | Spawns CLI tools |
| [c3-110](c3-1-api-server/c3-110-job-store.md) | Job Store | Job persistence client (uses c3-2) |
| [c3-111](c3-1-api-server/c3-111-job-processor.md) | Job Processor | Background job processor |
| [c3-113](c3-1-api-server/c3-113-browser-pool.md) | Browser Pool | Puppeteer instance pool for mermaid |
| [c3-115](c3-1-api-server/c3-115-terminal-renderer.md) | Terminal Renderer | PNG to terminal via catimg |

### c3-2 - SQLite Database

- [c3-2 - SQLite Database](c3-2-sqlite-db/README.md) - Persistent storage for async job records

## ADRs

| ID | Title | Status |
|----|-------|--------|
| [adr-20251223-async-render](adr/adr-20251223-async-render-with-job-polling.md) | Async Render with Job Polling | Accepted |
| [adr-20251223-mermaid-browser-pool](adr/adr-20251223-mermaid-browser-pool.md) | Replace mmdc CLI with Puppeteer Browser Pool | Accepted |
| [adr-20251223-split-boundaries](adr/adr-20251223-split-component-boundaries.md) | Split Component Boundaries | Proposed |
| [adr-20251224-catimg-terminal-output](adr/adr-20251224-catimg-terminal-output.md) | Add catimg Terminal Output for CLI Display | Accepted |
