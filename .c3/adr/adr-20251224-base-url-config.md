---
id: adr-20251224-base-url-config
title: Add BASE_URL Configuration for Deployment
status: accepted
date: 2024-12-24
---

# Add BASE_URL Configuration for Deployment

## Status
**Accepted** - 2024-12-24

## Problem/Requirement

The API currently returns relative URLs in responses:
- Sync render: `"url": "/d/abc12345"`
- Async render: `"statusUrl": "/jobs/job_abc123"`
- Job completed: `"url": "/d/abc12345"`

For deployment behind reverse proxies or when sharing links externally, clients need **absolute URLs** that include the protocol and hostname, e.g., `https://diagrams.example.com/d/abc12345`.

## Exploration Journey

**Initial hypothesis:** Add a BASE_URL environment variable to config, inject into response construction.

**Explored:**
- c3-108 (Config) - Existing env var pattern via tags
- c3-103 (Render Flow) - Response contracts show relative URLs
- c3-112 (Job Flow) - Response contracts show relative URLs
- Source code - URL construction in 3 locations

**Discovered:**
- URL construction is distributed across server.ts (sync), render-async.ts (async statusUrl), and job-status.ts (completed job URL)
- Pattern consistent: string template with path only
- No existing BASE_URL handling

## Solution

Add `BASE_URL` environment variable with empty string default (preserves current relative URL behavior). When set, prepend to all URL responses.

**Design choices:**
1. **Empty default** - Backward compatible; relative URLs work for local dev
2. **No trailing slash normalization** - BASE_URL should not include trailing slash; path always starts with `/`
3. **Single config tag** - One `baseUrlTag` injected where needed

## Changes Across Layers

### Context Level
- [c3-0]: No changes - no new actors or containers

### Container Level
- [c3-1-api-server]: Minor - adds one config variable, response format enhancement

### Component Level
- [c3-108-config]: Add `baseUrlTag` with `BASE_URL` env var, default empty string
- [c3-103-render-flow]: Update response contracts to show BASE_URL prefix
- [c3-112-job-flow]: Update response contracts to show BASE_URL prefix

## Verification

- [ ] BASE_URL="" (default) produces relative URLs (backward compat)
- [ ] BASE_URL="https://example.com" produces absolute URLs
- [ ] No trailing slash duplication (BASE_URL="https://example.com" + "/d/x" = correct)
- [ ] All 3 URL locations updated: sync render, async render, job status

## Implementation Plan

### Code Changes

| Layer Change | Code Location | Action | Details |
|--------------|---------------|--------|---------|
| c3-108 Config | src/config/tags.ts | Add tag | `baseUrlTag` reading `BASE_URL` with default "" |
| Sync render | src/server.ts:170,184 | Update | Prepend baseUrl to `/d/` paths |
| Async render | src/flows/render-async.ts:87 | Update | Prepend baseUrl to `/jobs/` path |
| Job status | src/flows/job-status.ts:59 | Update | Prepend baseUrl to `/d/` path |
| Docs | .c3/c3-108, c3-103, c3-112 | Update | Document BASE_URL in response contracts |

### Acceptance Criteria

| Verification Item | Criterion | How to Test |
|-------------------|-----------|-------------|
| Backward compatibility | No BASE_URL = relative URLs | Run existing tests |
| Absolute URLs | BASE_URL set = full URLs | Set env, POST /render, check response |
| All endpoints covered | Sync, async, job status all use BASE_URL | Verify each endpoint |
| No double slashes | BASE_URL without trailing slash works | Check URL construction |

## Related

- [c3-108 Config](../c3-1-api-server/c3-108-config.md) - Tag implementation
- [c3-103 Render Flow](../c3-1-api-server/c3-103-render-flow.md) - Sync response contract
- [c3-112 Job Flow](../c3-1-api-server/c3-112-job-flow.md) - Job response contract
