---
id: adr-20251223-split-component-boundaries
title: Split Component Boundaries by Axis of Change
status: proposed
date: 2025-12-23
---

# Split Component Boundaries by Axis of Change

## Status

**Proposed** - 2025-12-23

## Problem/Requirement

c3-101 "HTTP Router" documents multiple independent concerns:
- Bun server lifecycle and configuration
- Route matching and dispatch
- Authentication middleware
- Error-to-HTTP-response mapping

To understand one concern, you must read documentation for all. These concerns change for different reasons - they should be separate components.

Additionally, @pumped-fn/lite DI patterns are undocumented as a component, despite being foundational infrastructure.

## Exploration Journey

**Initial hypothesis:** c3-101 is too broad, mixing concerns.

**Explored:** Current c3-101 documents routing, auth, error mapping, and implicitly Bun.serve() setup in one component.

**Discovered:** Four independent axes of change exist. Each should have its own component.

## Solution

Split by axis of change. Each component has one reason to change.

**New component structure:**

| ID | Name | Axis of Change |
|----|------|----------------|
| c3-101 | Bun Server | Server lifecycle, Bun.serve() configuration |
| c3-102 | DI Infrastructure | @pumped-fn/lite patterns (atoms, flows, tags, scopes) |
| c3-103 | Render Flow | Business logic for rendering |
| c3-104 | Retrieve Flow | Business logic for retrieval |
| c3-105 | Cache | Storage with TTL |
| c3-106 | Queue | Backpressure control |
| c3-107 | Renderer | CLI tool spawning |
| c3-108 | Config | Environment loading |
| c3-109 | Logger | Logging infrastructure |

**Removed as separate components** (absorbed into Bun Server):
- Auth middleware → documented in Bun Server as a concern
- Error mapping → documented in Bun Server as a concern
- Route matching → documented in Bun Server as a concern

These are aspects of how Bun Server handles requests, not independent components.

## Changes Across Layers

### Context Level
- c3-0: No changes needed

### Container Level
- c3-1: Update component inventory, update internal structure diagram

### Component Level
- DELETE: c3-101-http-router.md (replaced)
- CREATE: c3-101-bun-server.md (server lifecycle, routing, auth, error mapping)
- CREATE: c3-102-di-infrastructure.md (@pumped-fn/lite patterns)
- RENAME: c3-102 → c3-103, c3-103 → c3-104, etc. (renumber)

## Verification

- [ ] Each component has one reason to change
- [ ] No component mixes independent concerns
- [ ] DI infrastructure is documented
- [ ] Bun server concerns are together (they change together)

## Implementation Plan

### Documentation Changes

| Change | File | Action |
|--------|------|--------|
| Container | c3-1-api-server/README.md | Update component table and diagram |
| Old Router | c3-101-http-router.md | Delete |
| Bun Server | c3-101-bun-server.md | Create |
| DI Infra | c3-102-di-infrastructure.md | Create |
| Render Flow | c3-103-render-flow.md | Rename from c3-102 |
| Retrieve Flow | c3-104-retrieve-flow.md | Rename from c3-103 |
| Cache | c3-105-cache.md | Rename from c3-104 |
| Queue | c3-106-queue.md | Rename from c3-105 |
| Renderer | c3-107-renderer.md | Rename from c3-106 |
| Config | c3-108-config.md | Rename from c3-107 |
| Logger | c3-109-logger.md | Rename from c3-108 |
| TOC | TOC.md | Update component list |

### Acceptance Criteria

| Item | Criterion | Test |
|------|-----------|------|
| Separation | Each component has single axis of change | Review component scope |
| DI documented | @pumped-fn/lite patterns are clear | Read c3-102 |
| Bun Server coherent | Server concerns documented together | Read c3-101 |

## Related

- .c3/c3-1-api-server/README.md
- .c3/c3-1-api-server/c3-101-http-router.md (to be replaced)
