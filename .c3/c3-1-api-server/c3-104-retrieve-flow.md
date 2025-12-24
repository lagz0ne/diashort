---
id: c3-104
c3-version: 3
title: Retrieve Flow
type: component
parent: c3-1
summary: >
  Fetches cached diagram by shortlink and handles cache misses.
---

# Retrieve Flow

## Contract

From Container (c3-1): "Fetch cached diagram by shortlink, handle cache misses"

## How It Works

### Flow

```mermaid
flowchart TD
    Input([Shortlink]) --> Parse[Parse & Validate Input]
    Parse -->|Invalid| NotFound[Throw NotFoundError]
    Parse -->|Valid| Lookup[Cache.get]

    Lookup -->|Hit| Decode[Base64 Decode]
    Lookup -->|Miss| NotFound
    Lookup -->|Expired| NotFound

    Decode --> Result([Return bytes + content-type])
```

### Dependencies

| Dependency | Component | Purpose |
|------------|-----------|---------|
| Cache | c3-104 | Look up stored diagram |
| Logger | c3-108 | Log cache hit/miss |

### Decision Points

| Decision | Condition | Outcome |
|----------|-----------|---------|
| Shortlink validation | Empty or missing | Reject with NotFoundError |
| Cache lookup | Entry exists and not expired | Return data or throw NotFoundError |

## Edge Cases

| Scenario | Behavior | Rationale |
|----------|----------|-----------|
| Empty shortlink | NotFoundError | Invalid request |
| Expired entry | NotFoundError | TTL enforcement |
| Non-existent shortlink | NotFoundError | Never rendered or already GC'd |

## Error Handling

| Error | Detection | Recovery |
|-------|-----------|----------|
| NotFoundError | Shortlink invalid or cache miss | Return to caller (becomes 404) |

## References

- src/flows/retrieve.ts - Implementation
