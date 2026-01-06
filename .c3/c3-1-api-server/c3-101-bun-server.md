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
- Route handlers for `/render`, `/d/:id`, `/jobs/:id`, `/render/terminal`, `/health`
- Optional Basic Auth enforcement
- Request ID generation and propagation
- Centralized error-to-HTTP-response mapping
- Graceful shutdown on SIGTERM/SIGINT

**Expects:**
- Environment configuration via tags (port, auth settings)
- DI scope with all atoms resolved at startup
- Browser pool warmed up before accepting requests
- Job processor running for async rendering

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Auth header missing (when enabled) | 401 + `WWW-Authenticate: Basic` |
| Invalid credentials | 401 Unauthorized |
| Unknown route | 404 Not Found |
| JSON parse error | 400 Bad Request |
| Queue full | 429 Too Many Requests + `Retry-After: 5` |
| Render failure | 500 Internal Server Error |
| SIGTERM received | Stop accepting, close scope, exit 0 |

## References

- `startServer()` - `src/server.ts:130`
- `Bun.serve({ fetch })` - `src/server.ts:158`
- `mapErrorToResponse()` - `src/server.ts:65`
- `checkBasicAuth()` - `src/server.ts:29`

## Testing Strategy

**Unit scope:** Error mapping logic, auth validation, route matching

**Integration scope:** Full request/response cycle with mocked flows

**Isolation:** Tests use `startServer()` which returns server handle for cleanup
