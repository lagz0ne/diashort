---
id: c3-109
c3-version: 3
title: Logger
type: component
parent: c3-1
summary: >
  Pino logger instance with environment-aware formatting.
---

# Logger

## Contract

From Container (c3-1): "Pino logger instance with environment-aware formatting"

## How It Works

### Flow

```mermaid
flowchart TD
    Tags([level, env tags]) --> CheckEnv{env = development?}

    CheckEnv -->|Yes| PrettyConfig[Configure pino-pretty transport]
    CheckEnv -->|No| JsonConfig[Configure JSON output]

    PrettyConfig --> CreateLogger[Create Pino instance]
    JsonConfig --> CreateLogger

    CreateLogger --> Result([Return logger])
```

### Dependencies

| Dependency | Component | Purpose |
|------------|-----------|---------|
| Config | c3-107 | Get log level and environment |

### Decision Points

| Decision | Condition | Outcome |
|----------|-----------|---------|
| Pretty printing | NODE_ENV = development | Use pino-pretty with colors |
| JSON output | NODE_ENV != development | Plain JSON logs |
| Log level | LOG_LEVEL env var | Filter log output |

## Edge Cases

| Scenario | Behavior | Rationale |
|----------|----------|-----------|
| Unknown log level | Pino handles gracefully | Library default behavior |
| Missing pino-pretty | Startup error in dev | Dev dependency required |

## Error Handling

| Error | Detection | Recovery |
|-------|-----------|----------|
| None | Logger creation is synchronous | N/A |

## Log Levels

| Level | Usage |
|-------|-------|
| debug | Detailed tracing (temp files, cache operations) |
| info | Normal operations (server start, render complete) |
| warn | Recoverable issues (cleanup failures) |
| error | Failures (render errors, request errors) |

## References

- src/atoms/logger.ts - Implementation
