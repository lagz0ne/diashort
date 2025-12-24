---
id: c3-101
c3-version: 3
title: Bun Server
type: component
parent: c3-1
summary: >
  HTTP server lifecycle, routing, authentication, and error-to-response mapping.
---

# Bun Server

## Contract

From Container (c3-1): "Server lifecycle, request handling, routing to flows"

## How It Works

### Flow

```mermaid
flowchart TD
    Start([Bun.serve]) --> Fetch[fetch handler]
    Fetch --> Route{Match Route}

    Route -->|POST /render| Auth{Auth Enabled?}
    Route -->|GET /jobs/:id| Dispatch3[Dispatch to Job Flow]
    Route -->|GET /d/:id| Dispatch2[Dispatch to Retrieve Flow]
    Route -->|GET /health| Health[Return 200]
    Route -->|GET /| Usage[Return usage text]
    Route -->|No match| NotFound[Return 404]

    Auth -->|Yes| Check{Valid?}
    Auth -->|No| Mode{mode param?}
    Check -->|Yes| Mode
    Check -->|No| Reject[Return 401]

    Mode -->|sync| Dispatch1Sync[Dispatch Render Flow - Sync]
    Mode -->|async/default| Dispatch1Async[Dispatch Render Flow - Async]

    Dispatch1Sync --> Result1{Success?}
    Dispatch1Async --> Result1Async{Success?}
    Dispatch2 --> Result2{Success?}
    Dispatch3 --> Result3{Success?}

    Result1 -->|Yes| JSON200[Return 200 JSON]
    Result1 -->|No| MapErr[Map Error]
    Result1Async -->|Yes| JSON202[Return 202 Accepted]
    Result1Async -->|No| MapErr
    Result2 -->|Yes| Bytes[Return bytes]
    Result2 -->|No| MapErr
    Result3 -->|Yes| JSON[Return Job Status]
    Result3 -->|No| MapErr

    MapErr --> ErrResp[HTTP Error Response]
```

### Dependencies

| Dependency | Component | Purpose |
|------------|-----------|---------|
| Render Flow | c3-103 | Business logic for rendering (sync/async) |
| Retrieve Flow | c3-104 | Business logic for retrieval |
| Job Flow | c3-112 | Business logic for job status lookup |
| Config | c3-108 | Auth settings, port |
| Logger | c3-109 | Error logging |

### Decision Points

| Decision | Condition | Outcome |
|----------|-----------|---------|
| Routing | URL + method | Dispatch to flow or static response |
| Auth gate | AUTH_ENABLED=true | Validate before render |
| Render mode | ?mode=sync query param | Sync (blocking) vs async (job) |
| Error mapping | Error class | Appropriate HTTP status |

## Concerns

### Routing

| Route | Method | Handler | Response |
|-------|--------|---------|----------|
| /render | POST | Render Flow | 202 (async) or 200 (sync) |
| /render?mode=sync | POST | Render Flow (sync) | 200 with shortlink |
| /jobs/:id | GET | Job Flow | 200 with job status or 404 |
| /d/:id | GET | Retrieve Flow | 200 with bytes or 404 |
| /health | GET | Static 200 | 200 |
| / | GET | Usage text | 200 |

### Authentication

| Aspect | Behavior |
|--------|----------|
| Scheme | Basic Auth |
| Scope | POST /render only |
| Toggle | AUTH_ENABLED env var |

### Error Mapping

| Error Class | HTTP Status | Headers |
|-------------|-------------|---------|
| AuthError | 401 | WWW-Authenticate |
| ValidationError | 400 | - |
| NotFoundError | 404 | - |
| JobNotFoundError | 404 | - |
| BackpressureError | 429 | Retry-After |
| RenderError | 500 | - |

## Edge Cases

| Scenario | Behavior | Rationale |
|----------|----------|-----------|
| Malformed JSON body | 400 via ParseError | Invalid input |
| Missing auth header | 401 with challenge | Basic Auth spec |

## Error Handling

| Error | Detection | Recovery |
|-------|-----------|----------|
| Flow errors | try/catch in fetch | Map to HTTP response |
| Unhandled errors | Catch-all | 500 with message |

## References

- src/server.ts - Implementation
