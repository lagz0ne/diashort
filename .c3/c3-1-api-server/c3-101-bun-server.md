---
id: c3-101
title: Bun Server
type: component
category: foundation
parent: c3-1
goal: Serve as the single HTTP entry point: accept requests, enforce auth, route to the correct flow, map errors to HTTP responses, and manage server lifecycle (startup, graceful shutdown, cleanup intervals).
---

# Bun Server

HTTP entry point for the API. Uses `Bun.serve()` with manual routing, optional Basic Auth, and centralized error mapping. Each request creates an isolated DI context for execution.

## Goal

Serve as the single HTTP entry point: accept requests, enforce auth, route to the correct flow, map errors to HTTP responses, and manage server lifecycle (startup, graceful shutdown, cleanup intervals).

## Dependencies

| Direction | What | From/To |
| --- | --- | --- |
| IN | Environment config tags (port, auth) | c3-103 |
| IN | DI scope and context creation | c3-102 |
| IN | Logger instance | c3-106 |
| IN | Error classes for HTTP mapping | c3-108 |
| OUT | Request dispatch to Create Flow | c3-114 |
| OUT | Request dispatch to View Flow | c3-116 |
| OUT | Request dispatch to Embed Flow | c3-123 |
| OUT | Request dispatch to Diff Flow | c3-127 |
## Contract

**Provides:**

- HTTP server on configurable port (default 3000)
- Route handlers for `/render`, `/d/:id`, `/d/:id/:version`, `/e/:id`, `/e/:id/:version`, `/diff`, `/diff/:id`, `/health`, `/`
- API endpoints for `/api/d/:id/versions` and `/api/d/:id/versions/:v/source`
- Optional Basic Auth enforcement (POST endpoints only)
- Request ID generation and propagation
- Centralized error-to-HTTP-response mapping
- Graceful shutdown on SIGTERM/SIGINT
- Cleanup interval for expired diagrams and diffs
**Expects:**

- Environment configuration via tags (port, auth settings)
- DI scope with all atoms resolved at startup
- Optional mermaid renderer resolved for SSR check
## Routes

| Method | Path | Auth | Handler |
| --- | --- | --- | --- |
| POST | /render | Yes (if enabled) | Create Flow (c3-114) |
| POST | /diff | Yes (if enabled) | Create Diff Flow (c3-127) |
| GET | /d/:shortlink | No | View Flow (c3-116) — 302 redirect to latest version |
| GET | /d/:shortlink/:version | No | View Flow (c3-116) — versioned, immutable-cached |
| GET | /e/:shortlink | No | Embed Flow (c3-123) — 302 redirect to latest version |
| GET | /e/:shortlink/:version | No | Embed Flow (c3-123) — versioned SVG embed |
| GET | /diff/:shortlink | No | View Diff Flow (c3-127) |
| GET | /api/d/:id/versions | No | List all versions for a shortlink (JSON) |
| GET | /api/d/:id/versions/:v/source | No | Get version source code (JSON) |
| GET | /health | No | Health check |
| GET | / | No | Usage documentation |
## Edge Cases

| Scenario | Behavior |
| --- | --- |
| Auth header missing (when enabled) | 401 + WWW-Authenticate: Basic |
| Invalid credentials | 401 Unauthorized |
| Unknown route | 404 Not Found |
| JSON parse error | 400 Bad Request |
| Render failure | 500/503/504 depending on type |
| SIGTERM received | Stop accepting, close scope, exit 0 |
| View/Embed with version specified | Response includes Link: </api/d/:id/versions/:v/source>; rel="source" header |
## References

- `startServer()` - `src/server.ts:143`
- `Bun.serve({ fetch })` - `src/server.ts:177`
- `mapErrorToResponse()` - `src/server.ts:64`
- `checkBasicAuth()` - `src/server.ts:28`
## Testing Strategy

**Unit scope:** Error mapping logic, auth validation, route matching

**Integration scope:** Full request/response cycle with mocked flows

**Isolation:** Tests use `startServer()` which returns server handle for cleanup
