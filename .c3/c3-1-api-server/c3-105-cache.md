---
id: c3-105
c3-version: 3
title: Cache
type: component
parent: c3-1
summary: >
  In-memory storage with TTL expiration and periodic garbage collection.
---

# Cache

## Contract

From Container (c3-1): "In-memory storage with TTL expiration and periodic garbage collection"

## How It Works

### Flow

```mermaid
flowchart TD
    subgraph Store["store(data, contentType)"]
        GenID[Generate 8-char UUID] --> CreateEntry[Create Entry with timestamp]
        CreateEntry --> MapSet[Map.set]
        MapSet --> ReturnID([Return shortlink])
    end

    subgraph Get["get(shortlink)"]
        Lookup[Map.get] --> Exists{Entry Exists?}
        Exists -->|No| ReturnUndefined([Return undefined])
        Exists -->|Yes| CheckTTL{Expired?}
        CheckTTL -->|Yes| Delete[Delete Entry]
        Delete --> ReturnUndefined
        CheckTTL -->|No| ReturnData([Return data + contentType])
    end

    subgraph GC["Periodic GC"]
        Timer[Interval Timer] --> Iterate[Iterate all entries]
        Iterate --> CheckEach{Entry Expired?}
        CheckEach -->|Yes| DeleteEntry[Delete]
        CheckEach -->|No| Skip[Skip]
        DeleteEntry --> Next[Next Entry]
        Skip --> Next
    end
```

### Dependencies

| Dependency | Component | Purpose |
|------------|-----------|---------|
| Config | c3-107 | Get TTL and GC interval settings |
| Logger | c3-108 | Log cache operations |

### Decision Points

| Decision | Condition | Outcome |
|----------|-----------|---------|
| Entry expiration | now - storedAt > ttlMs | Entry considered expired |
| GC trigger | Every gcIntervalMs | Scan and remove expired entries |
| Shortlink format | First 8 chars of UUID | Collision-resistant, URL-safe |

## Edge Cases

| Scenario | Behavior | Rationale |
|----------|----------|-----------|
| Get expired entry | Delete and return undefined | Lazy expiration on access |
| GC during high load | Runs on interval regardless | Background cleanup |
| Scope disposal | Clear GC interval | Prevent memory leaks |

## Error Handling

| Error | Detection | Recovery |
|-------|-----------|----------|
| None | Cache operations are synchronous and safe | N/A |

## Configuration

| Setting | Environment Variable | Default | Purpose |
|---------|---------------------|---------|---------|
| TTL | CACHE_TTL | 300000 (5 min) | Entry lifetime in ms |
| GC Interval | CACHE_GC_INTERVAL | 60000 (1 min) | Cleanup frequency in ms |

## References

- src/atoms/cache.ts - Implementation
