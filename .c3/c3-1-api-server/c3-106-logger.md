---
id: c3-106
c3-version: 3
title: Logger
type: component
category: foundation
parent: c3-1
summary: Pino-based structured logging with configurable level and pretty-print
---

# Logger

Provides a Pino logger instance via DI atom. Pretty-prints in development, JSON in production. All components depend on `loggerAtom` for structured logging.

## Contract

**Provides:**
- `loggerAtom` - Pino `Logger` instance

**Expects:**
- `logLevelTag` - Log level (debug/info/warn/error)
- `nodeEnvTag` - Environment (development enables pretty-print)

## Behavior

| Environment | Output |
|-------------|--------|
| `development` | `pino-pretty` with colors |
| `production` | JSON structured logs |

## References

- `loggerAtom` - `src/atoms/logger.ts:5`
