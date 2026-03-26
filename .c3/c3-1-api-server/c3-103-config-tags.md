---
id: c3-103
title: Config Tags
type: component
category: foundation
parent: c3-1
goal: Centralize all environment-based configuration into typed, validated tags so that components receive config through DI rather than reading env vars directly.
---

# Config Tags

All configuration is loaded from environment variables at startup and injected via typed tags. `loadConfigTags()` parses and validates env vars, returning an array of tagged values for scope creation.

## Goal

Centralize all environment-based configuration into typed, validated tags so that components receive config through DI rather than reading env vars directly.

## Dependencies

| Direction | What | From/To |
| --- | --- | --- |
| IN | Environment variables at process startup | c3-1 |
| OUT | Typed tag values to DI scope | c3-102 |
| OUT | Port, auth, and base URL config to server | c3-101 |
| OUT | Log level and node env to logger | c3-106 |
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
| --- | --- | --- | --- |
| logLevelTag | LogLevel | "info" | LOG_LEVEL |
| nodeEnvTag | string | "development" | NODE_ENV |
| serverPortTag | number | 3000 | PORT |
| authEnabledTag | boolean | false | AUTH_ENABLED |
| authCredentialsTag | AuthCredentials | null | null | AUTH_USER, AUTH_PASS |
| baseUrlTag | string | "" | BASE_URL |
| diagramConfigTag | DiagramConfig | {dbPath: "./data/diagrams.db", retentionDays: 30, cleanupIntervalMs: 86400000} | DIAGRAM_DB_PATH, DIAGRAM_RETENTION_DAYS, CLEANUP_INTERVAL_MS |
| mermaidConfigTag | MermaidConfig | (only set if CHROME_PATH) | CHROME_PATH, MERMAID_DB_PATH, MERMAID_POOL_SIZE, MERMAID_TIMEOUT, MERMAID_NO_SANDBOX, MERMAID_MAX_QUEUE |
| requestIdTag | string | (per-request) | - |
| requestOriginTag | string | "" | (per-request) |
## Validation

- `BASE_URL` validated via zod: must be valid URL, no trailing slash, http(s) only
- Number fields reject NaN
- Empty strings treated as undefined
## References

- `loadConfigTags()` - `src/config/tags.ts:148`
- Tag definitions - `src/config/tags.ts:38-88`
