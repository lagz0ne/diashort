---
id: c3-103
c3-version: 3
title: Config Tags
type: component
category: foundation
parent: c3-1
summary: Environment-based configuration via @pumped-fn/lite tag system
---

# Config Tags

All configuration is loaded from environment variables at startup and injected via typed tags. `loadConfigTags()` parses and validates env vars, returning an array of tagged values for scope creation.

## Contract

**Provides:**
- `loadConfigTags(env)` - Parse all env vars into typed tags
- Individual tags for each config domain

**Expects:**
- Environment variables set (or defaults used)
- `AUTH_USER` and `AUTH_PASS` required when `AUTH_ENABLED=true`
- `CHROME_PATH` triggers mermaid SSR configuration

## Tags

| Tag | Type | Default | Env Variable |
|-----|------|---------|--------------|
| `logLevelTag` | `LogLevel` | `"info"` | `LOG_LEVEL` |
| `nodeEnvTag` | `string` | `"development"` | `NODE_ENV` |
| `serverPortTag` | `number` | `3000` | `PORT` |
| `authEnabledTag` | `boolean` | `false` | `AUTH_ENABLED` |
| `authCredentialsTag` | `AuthCredentials \| null` | `null` | `AUTH_USER`, `AUTH_PASS` |
| `baseUrlTag` | `string` | `""` | `BASE_URL` |
| `diagramConfigTag` | `DiagramConfig` | `{dbPath: "./data/diagrams.db", retentionDays: 30, cleanupIntervalMs: 86400000}` | `DIAGRAM_DB_PATH`, `DIAGRAM_RETENTION_DAYS`, `CLEANUP_INTERVAL_MS` |
| `mermaidConfigTag` | `MermaidConfig` | _(only set if CHROME_PATH)_ | `CHROME_PATH`, `MERMAID_DB_PATH`, `MERMAID_POOL_SIZE`, `MERMAID_TIMEOUT`, `MERMAID_NO_SANDBOX`, `MERMAID_MAX_QUEUE` |
| `requestIdTag` | `string` | _(per-request)_ | - |
| `requestOriginTag` | `string` | `""` | _(per-request)_ |

## Validation

- `BASE_URL` validated via zod: must be valid URL, no trailing slash, http(s) only
- Number fields reject NaN
- Empty strings treated as undefined

## References

- `loadConfigTags()` - `src/config/tags.ts:148`
- Tag definitions - `src/config/tags.ts:38-88`
