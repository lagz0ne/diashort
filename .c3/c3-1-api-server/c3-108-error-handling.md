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

| Class | Status | When Used | Location |
|-------|--------|-----------|----------|
| `ValidationError` | 400 | Invalid input (missing fields, wrong format) | `src/flows/create.ts` |
| `AuthError` | 401 | Missing/invalid credentials | `src/extensions/auth.ts` |
| `NotFoundError` | 404 | Diagram shortlink not found | `src/flows/view.ts` |
| `EmbedNotSupportedError` | 404 | Embed requested for unsupported format/config | `src/flows/embed.ts` |
| `EmbedRenderError` | dynamic | Render failure during embed (500/503/504) | `src/flows/embed.ts` |
| `DiffValidationError` | 400 | Invalid diff input (missing fields, bad syntax) | `src/flows/diff.ts` |
| `DiffNotFoundError` | 404 | Diff shortlink not found | `src/flows/diff.ts` |

## Applies To

- **Bun Server (c3-101):** `mapErrorToResponse()` handles all thrown errors
- **Create Flow (c3-114):** Throws `ValidationError` for bad input
- **View Flow (c3-116):** Throws `NotFoundError` on missing diagram
- **Embed Flow (c3-123):** Throws `EmbedNotSupportedError`, `EmbedRenderError`
- **Diff Flow (c3-127):** Throws `DiffValidationError`, `DiffNotFoundError`

## References

- `mapErrorToResponse()` - `src/server.ts:64`
- `ValidationError` - `src/flows/create.ts:17`
- `NotFoundError` - `src/flows/view.ts:8`
- `AuthError` - `src/extensions/auth.ts:1`
- `EmbedNotSupportedError` - `src/flows/embed.ts:18`
- `EmbedRenderError` - `src/flows/embed.ts:26`
- `DiffValidationError` - `src/flows/diff.ts:9`
- `DiffNotFoundError` - `src/flows/diff.ts:17`

## Testing Strategy

**Verification approach:**
- Each flow test includes invalid input case
- HTTP status codes verified in integration tests
- Error messages checked for non-sensitive content
