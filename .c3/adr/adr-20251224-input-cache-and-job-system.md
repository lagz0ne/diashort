---
id: adr-20251224-input-cache-and-job-system
title: Input Caching and Non-Blocking Job System Implementation
status: proposed
date: 2024-12-24
---

# Input Caching and Non-Blocking Job System Implementation

## Status
**Proposed** - 2024-12-24

## Problem/Requirement

Two requirements to reduce application load:

1. **Input Caching (Deduplication)** - If the same input (source + format + outputType) is submitted multiple times, reuse the previously generated shortlink instead of re-rendering.

2. **Non-Blocking Render** - Return a token immediately on render request, process rendering in background, allow client to poll for result.

## Exploration Journey

**Initial hypothesis:** Changes needed in Cache (c3-105) and a new non-blocking queue pattern.

**Explored:**
- c3-105 (Cache) - Currently stores `shortlink → rendered output`, no input deduplication
- c3-106 (Queue) - Backpressure control only, not async job processing
- c3-103 (Render Flow) - Synchronous, blocks until render completes
- c3-110, c3-111 (Job Store, Job Processor) - Documented in C3 but NOT implemented in code

**Discovered:**
- The async job system is already designed in C3 docs but not built
- Input caching needs a second mapping: `inputHash → shortlink`
- User confirmed: implement full job system (c3-110, c3-111), share TTL between input and output caches

## Solution

### 1. Input Cache (Deduplication)

Add a second index to the Cache component:
- Key: SHA-256 hash of `${source}|${format}|${outputType}`
- Value: existing shortlink
- TTL: Same as output cache (shared expiration)

**Flow change in c3-103 (Render Flow):**
```
Input → Hash Input → Check Input Cache
  ├─ HIT → Return existing shortlink (skip render)
  └─ MISS → Proceed with render → Store in both caches
```

### 2. Non-Blocking Job System

Implement the documented components:

**c3-110 Job Store** - SQLite-backed job persistence:
- `create(input)` → returns `job_<uuid>` immediately
- `get(jobId)` → job record with status
- `updateStatus(jobId, status, result?)` → status transitions
- `getPending()` → next job to process (FIFO)
- `cleanup()` → remove expired completed/failed jobs

**c3-111 Job Processor** - Background worker:
- Polls for pending jobs
- Acquires queue slot → renders → stores result → updates job status
- Handles failures gracefully (marks job failed, continues polling)

**c3-112 Job Flow** - Already documented, status lookup endpoint.

**API Changes:**
- `POST /render` (default) → Returns `{ jobId, status: "pending", statusUrl: "/jobs/:id" }` with 202 Accepted
- `POST /render?mode=sync` → Current behavior, blocks and returns shortlink
- `GET /jobs/:id` → Returns job status, shortlink when completed

## Changes Across Layers

### Context Level
- [c3-0]: Add job polling endpoint to API surface (already documented)

### Container Level
- [c3-1 API Server]: No container-level changes, components already planned
- [c3-2 SQLite Database]: Already documented as container for job storage

### Component Level

| Component | Change |
|-----------|--------|
| c3-103 (Render Flow) | Add input cache check before render; support async mode (create job instead of render) |
| c3-105 (Cache) | Add `storeWithInput(inputHash, shortlink)` and `getByInput(inputHash)` methods |
| c3-110 (Job Store) | **NEW** - Implement as documented in C3 |
| c3-111 (Job Processor) | **NEW** - Implement as documented in C3 |
| c3-112 (Job Flow) | **NEW** - Implement status lookup endpoint |
| c3-101 (Bun Server) | Add `/jobs/:id` route |

## Verification

- [ ] Duplicate input returns existing shortlink without re-rendering
- [ ] `POST /render` returns 202 with jobId (async mode default)
- [ ] `POST /render?mode=sync` returns 200 with shortlink (sync mode)
- [ ] `GET /jobs/:id` returns job status
- [ ] Job processor picks up pending jobs and renders them
- [ ] Completed jobs have shortlink, failed jobs have error message
- [ ] Input cache and output cache expire together

## Implementation Plan

### Code Changes

| Layer Change | Code Location | Action | Details |
|--------------|---------------|--------|---------|
| Input cache methods | src/atoms/cache.ts | Modify | Add `inputHashes` Map, `storeWithInput()`, `getByInput()` methods |
| Input hash utility | src/flows/render.ts | Add | `hashInput(source, format, outputType)` using SHA-256 |
| Async mode in render flow | src/flows/render.ts | Modify | Check mode param, create job instead of rendering when async |
| Job Store atom | src/atoms/job-store.ts | Create | Implement c3-110 with bun:sqlite |
| Job Processor atom | src/atoms/job-processor.ts | Create | Implement c3-111 background worker |
| Job Flow | src/flows/job-status.ts | Create | Implement c3-112 status lookup |
| Job routes | src/server.ts | Modify | Add `GET /jobs/:id` route |
| Config tags | src/config/tags.ts | Modify | Add `JOB_DB_PATH`, `JOB_POLL_INTERVAL_MS`, `JOB_RETENTION_MS` |

### Acceptance Criteria

| Verification Item | Criterion | How to Test |
|-------------------|-----------|-------------|
| Input deduplication | Same input returns same shortlink | POST same diagram twice, verify same shortlink, no re-render in logs |
| Async default | POST /render returns 202 | curl POST /render, expect 202 + jobId |
| Sync mode | POST /render?mode=sync returns 200 | curl POST /render?mode=sync, expect 200 + shortlink |
| Job status | GET /jobs/:id returns job | curl GET /jobs/:id, expect job record |
| Job processing | Pending job gets rendered | Create job, wait, poll status until completed |
| Job failure handling | Failed render marks job failed | Submit invalid diagram, check job status shows error |
| Cache TTL shared | Both caches expire together | Wait for TTL, verify both input and output cache miss |

## Related

- `.c3/c3-1-api-server/c3-103-render-flow.md` - Render flow to modify
- `.c3/c3-1-api-server/c3-105-cache.md` - Cache component to extend
- `.c3/c3-1-api-server/c3-110-job-store.md` - Job Store to implement
- `.c3/c3-1-api-server/c3-111-job-processor.md` - Job Processor to implement
- `.c3/c3-1-api-server/c3-112-job-flow.md` - Job Flow to implement
- `.c3/adr/adr-20251223-async-render-with-job-polling.md` - Original async render decision
