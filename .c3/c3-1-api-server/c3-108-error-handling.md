---
id: c3-108
c3-version: 3
title: Error Handling
type: component
category: auxiliary
parent: c3-1
summary: Typed error classes with consistent HTTP status code mapping
---

# Error Handling

Establishes the pattern for domain errors. Each error class has a corresponding HTTP status code, and the server maps them centrally via `mapErrorToResponse()`.

## Conventions

| Rule | Why |
|------|-----|
| Extend `Error` with descriptive `name` property | Stack traces identify error type |
| Include `statusCode` property on domain errors | Enables consistent HTTP mapping |
| Throw typed errors from flows, not generic `Error` | Caller can handle specifically |
| Map all errors in `mapErrorToResponse()` | Single source of truth for HTTP codes |
| Log errors with context before mapping | Debugging without exposing internals |

## Error Classes

| Class | Status | When Used |
|-------|--------|-----------|
| `ValidationError` | 400 | Invalid input (missing fields, wrong format) |
| `AuthError` | 401 | Missing/invalid credentials |
| `NotFoundError` | 404 | Shortlink not in cache |
| `JobNotFoundError` | 404 | Job ID not in database |
| `BackpressureError` | 429 | Queue full, retry later |
| `RenderError` | 500 | External tool failure (mmdc, d2) |
| `MermaidRenderError` | 500 | Mermaid-specific render failure |
| `ChafaError` | 500 | Terminal renderer failure |

## Applies To

- **Bun Server (c3-101):** `mapErrorToResponse()` handles all thrown errors
- **All Flows:** Throw typed errors for business logic failures
- **Renderer (c3-109):** Wraps external tool failures in `RenderError`
- **Job Store (c3-112):** Returns null instead of throwing (caller throws `JobNotFoundError`)

## References

- `mapErrorToResponse()` - `src/server.ts:65`
- `ValidationError` - `src/flows/render.ts:23`
- `NotFoundError` - `src/flows/retrieve.ts:5`
- `BackpressureError` - `src/atoms/queue.ts:6`
- `RenderError` - `src/atoms/renderer.ts:9`
- `AuthError` - `src/extensions/auth.ts`

## Testing Strategy

**Verification approach:**
- Each flow test includes invalid input case
- HTTP status codes verified in integration tests
- Error messages checked for non-sensitive content
