---
id: c3-101
c3-version: 3
title: Bun Server
type: component
category: foundation
parent: c3-1
summary: HTTP entry point using Bun.serve with routing, auth, and error handling
---

# Bun Server

HTTP entry point for the API. Uses `Bun.serve()` with manual routing, optional Basic Auth, and centralized error mapping. Each request creates an isolated DI context for execution.

## Contract

**Provides:**
- HTTP server on configurable port (default 3000)
- Route handlers for `/render`, `/d/:id`, `/e/:id`, `/diff`, `/diff/:id`, `/health`, `/`
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
|--------|------|------|---------|
| POST | `/render` | Yes (if enabled) | Create Flow (c3-114) |
| POST | `/diff` | Yes (if enabled) | Create Diff Flow (c3-127) |
| GET | `/d/:shortlink` | No | View Flow (c3-116) |
| GET | `/e/:shortlink` | No | Embed Flow (c3-123) |
| GET | `/diff/:shortlink` | No | View Diff Flow (c3-127) |
| GET | `/health` | No | Health check |
| GET | `/` | No | Usage documentation |

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Auth header missing (when enabled) | 401 + `WWW-Authenticate: Basic` |
| Invalid credentials | 401 Unauthorized |
| Unknown route | 404 Not Found |
| JSON parse error | 400 Bad Request |
| Render failure | 500/503/504 depending on type |
| SIGTERM received | Stop accepting, close scope, exit 0 |

## References

- `startServer()` - `src/server.ts:129`
- `Bun.serve({ fetch })` - `src/server.ts:163`
- `mapErrorToResponse()` - `src/server.ts:64`
- `checkBasicAuth()` - `src/server.ts:28`

## Testing Strategy

**Unit scope:** Error mapping logic, auth validation, route matching

**Integration scope:** Full request/response cycle with mocked flows

**Isolation:** Tests use `startServer()` which returns server handle for cleanup
