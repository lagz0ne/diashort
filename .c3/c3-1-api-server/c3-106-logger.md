---
id: c3-106
title: Logger
type: component
category: foundation
parent: c3-1
goal: Provide a single structured logging instance to all components, with environment-aware formatting (pretty in dev, JSON in production).
---

# Logger

Provides a Pino logger instance via DI atom. Pretty-prints in development, JSON in production. All components depend on `loggerAtom` for structured logging.

## Goal

Provide a single structured logging instance to all components, with environment-aware formatting (pretty in dev, JSON in production).

## Dependencies

| Direction | What | From/To |
| --- | --- | --- |
| IN | Log level configuration | c3-103 |
| IN | Node environment for format selection | c3-103 |
| OUT | Logger instance to all components | c3-1 |
## Contract

**Provides:**

- `loggerAtom` - Pino `Logger` instance
**Expects:**

- `logLevelTag` - Log level (debug/info/warn/error)
- `nodeEnvTag` - Environment (development enables pretty-print)
## Behavior

| Environment | Output |
| --- | --- |
| development | pino-pretty with colors |
| production | JSON structured logs |
## References

- `loggerAtom` - `src/atoms/logger.ts:5`
