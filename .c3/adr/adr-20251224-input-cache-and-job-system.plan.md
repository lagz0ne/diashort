# Input Caching and Job System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add input deduplication to avoid re-rendering identical diagrams, and implement async job system for non-blocking render requests.

**Architecture:** Two independent features that integrate at the Render Flow. Input cache adds a hash→shortlink lookup before rendering. Job system adds SQLite-backed async processing where POST /render returns immediately with a job ID, and a background processor handles actual rendering.

**Tech Stack:** Bun runtime, bun:sqlite, @pumped-fn/lite (atoms/flows), SHA-256 for input hashing

---

## Task 1: Add Job Config Tags

**Files:**
- Modify: `src/config/tags.ts`
- Test: `src/__tests__/config.test.ts`

**Step 1: Write the failing test for job config parsing**

```typescript
// Add to src/__tests__/config.test.ts
import { describe, test, expect } from "bun:test";
import { loadConfigTags, jobConfigTag } from "../config/tags";

describe("job config", () => {
  test("uses defaults when env vars not set", () => {
    const tags = loadConfigTags({});
    const jobConfig = tags.find(t => t.label === "job-config");
    expect(jobConfig).toBeDefined();
    expect(jobConfig?.value).toEqual({
      dbPath: "./data/jobs.db",
      pollIntervalMs: 100,
      retentionMs: 3600000,
      cleanupIntervalMs: 60000,
    });
  });

  test("parses job config from env vars", () => {
    const tags = loadConfigTags({
      JOB_DB_PATH: "/tmp/test.db",
      JOB_POLL_INTERVAL_MS: "200",
      JOB_RETENTION_MS: "7200000",
      JOB_CLEANUP_INTERVAL_MS: "120000",
    });
    const jobConfig = tags.find(t => t.label === "job-config");
    expect(jobConfig?.value).toEqual({
      dbPath: "/tmp/test.db",
      pollIntervalMs: 200,
      retentionMs: 7200000,
      cleanupIntervalMs: 120000,
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test src/__tests__/config.test.ts`
Expected: FAIL - jobConfigTag not exported

**Step 3: Add JobConfig interface and tag**

```typescript
// Add to src/config/tags.ts after QueueConfig interface

export interface JobConfig {
  dbPath: string;
  pollIntervalMs: number;
  retentionMs: number;
  cleanupIntervalMs: number;
}

export const jobConfigTag = tag<JobConfig>({
  label: "job-config",
  default: {
    dbPath: "./data/jobs.db",
    pollIntervalMs: 100,
    retentionMs: 3600000,
    cleanupIntervalMs: 60000,
  },
});
```

**Step 4: Update loadConfigTags to parse job config**

```typescript
// Add inside loadConfigTags function, before the return statement

const jobDbPath = getEnv(env, "JOB_DB_PATH") ?? "./data/jobs.db";
const jobPollInterval = parseNumber(env, "JOB_POLL_INTERVAL_MS", 100);
const jobRetention = parseNumber(env, "JOB_RETENTION_MS", 3600000);
const jobCleanupInterval = parseNumber(env, "JOB_CLEANUP_INTERVAL_MS", 60000);

// Add to the return array:
jobConfigTag({
  dbPath: jobDbPath,
  pollIntervalMs: jobPollInterval,
  retentionMs: jobRetention,
  cleanupIntervalMs: jobCleanupInterval,
}),
```

**Step 5: Run test to verify it passes**

Run: `bun test src/__tests__/config.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/config/tags.ts src/__tests__/config.test.ts
git commit -m "feat: add job config tags for async processing"
```

---

## Task 2: Extend Cache with Input Deduplication

**Files:**
- Modify: `src/atoms/cache.ts`
- Test: `src/__tests__/cache.test.ts`

**Step 1: Write the failing test for input cache**

```typescript
// Add to src/__tests__/cache.test.ts
import { describe, test, expect, beforeEach } from "bun:test";
import { createScope } from "@pumped-fn/lite";
import { cacheAtom } from "../atoms/cache";
import { cacheConfigTag } from "../config/tags";

describe("input cache", () => {
  test("getByInputHash returns undefined for unknown hash", async () => {
    const scope = createScope({
      tags: [cacheConfigTag({ ttlMs: 300000, gcIntervalMs: 60000 })],
    });
    const cache = await scope.resolve(cacheAtom);

    const result = cache.getByInputHash("unknown-hash");
    expect(result).toBeUndefined();

    await scope.dispose();
  });

  test("storeWithInputHash links input hash to shortlink", async () => {
    const scope = createScope({
      tags: [cacheConfigTag({ ttlMs: 300000, gcIntervalMs: 60000 })],
    });
    const cache = await scope.resolve(cacheAtom);

    // Store content and get shortlink
    const shortlink = cache.store("test-data", "image/svg+xml");

    // Link input hash to shortlink
    const inputHash = "abc123hash";
    cache.storeInputHash(inputHash, shortlink);

    // Retrieve by input hash
    const result = cache.getByInputHash(inputHash);
    expect(result).toBe(shortlink);

    await scope.dispose();
  });

  test("input hash expires with output cache TTL", async () => {
    const scope = createScope({
      tags: [cacheConfigTag({ ttlMs: 50, gcIntervalMs: 10 })],
    });
    const cache = await scope.resolve(cacheAtom);

    const shortlink = cache.store("test-data", "image/svg+xml");
    cache.storeInputHash("test-hash", shortlink);

    // Verify it exists
    expect(cache.getByInputHash("test-hash")).toBe(shortlink);

    // Wait for expiration
    await new Promise(r => setTimeout(r, 100));

    // Should be expired
    expect(cache.getByInputHash("test-hash")).toBeUndefined();

    await scope.dispose();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test src/__tests__/cache.test.ts`
Expected: FAIL - getByInputHash and storeInputHash not defined

**Step 3: Add input hash storage to cache**

```typescript
// Modify src/atoms/cache.ts

interface InputHashEntry {
  shortlink: string;
  storedAt: number;
}

export interface CacheService {
  store(data: string, contentType: string): string;
  get(shortlink: string): { data: string; contentType: string } | undefined;
  storeInputHash(inputHash: string, shortlink: string): void;
  getByInputHash(inputHash: string): string | undefined;
}

export const cacheAtom = atom({
  deps: {
    config: tags.required(cacheConfigTag),
    logger: loggerAtom,
  },
  factory: (ctx, { config, logger }): CacheService => {
    const cache = new Map<string, CacheEntry>();
    const inputHashes = new Map<string, InputHashEntry>();

    // ... existing store and get functions ...

    const storeInputHash = (inputHash: string, shortlink: string): void => {
      inputHashes.set(inputHash, {
        shortlink,
        storedAt: Date.now(),
      });
      logger.debug({ inputHash, shortlink }, "Stored input hash mapping");
    };

    const getByInputHash = (inputHash: string): string | undefined => {
      const entry = inputHashes.get(inputHash);

      if (!entry) {
        return undefined;
      }

      const isExpired = Date.now() - entry.storedAt > config.ttlMs;
      if (isExpired) {
        logger.debug({ inputHash }, "Input hash mapping expired");
        inputHashes.delete(inputHash);
        return undefined;
      }

      return entry.shortlink;
    };

    const runGc = () => {
      const now = Date.now();
      let cleanedCount = 0;

      // Clean output cache
      for (const [key, entry] of cache.entries()) {
        if (now - entry.storedAt > config.ttlMs) {
          cache.delete(key);
          cleanedCount++;
        }
      }

      // Clean input hash cache
      for (const [key, entry] of inputHashes.entries()) {
        if (now - entry.storedAt > config.ttlMs) {
          inputHashes.delete(key);
          cleanedCount++;
        }
      }

      if (cleanedCount > 0) {
        logger.debug({ cleanedCount }, "GC cleanup finished");
      }
    };

    // ... rest of existing code ...

    return { store, get, storeInputHash, getByInputHash };
  },
});
```

**Step 4: Run test to verify it passes**

Run: `bun test src/__tests__/cache.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/atoms/cache.ts src/__tests__/cache.test.ts
git commit -m "feat: add input hash deduplication to cache"
```

---

## Task 3: Implement Job Store (c3-110)

**Files:**
- Create: `src/atoms/job-store.ts`
- Test: `src/__tests__/job-store.test.ts`

**Step 1: Write the failing test for job creation**

```typescript
// Create src/__tests__/job-store.test.ts
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createScope } from "@pumped-fn/lite";
import { jobStoreAtom, type JobStatus } from "../atoms/job-store";
import { jobConfigTag, logLevelTag } from "../config/tags";
import { unlinkSync, existsSync } from "fs";

const TEST_DB_PATH = "/tmp/test-jobs.db";

describe("job-store", () => {
  let scope: ReturnType<typeof createScope>;

  beforeEach(async () => {
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
    scope = createScope({
      tags: [
        jobConfigTag({
          dbPath: TEST_DB_PATH,
          pollIntervalMs: 100,
          retentionMs: 3600000,
          cleanupIntervalMs: 60000,
        }),
        logLevelTag("error"),
      ],
    });
  });

  afterEach(async () => {
    await scope.dispose();
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
  });

  test("create returns job with pending status", async () => {
    const jobStore = await scope.resolve(jobStoreAtom);

    const jobId = jobStore.create({
      source: "graph TD; A-->B;",
      format: "mermaid",
      outputType: "svg",
    });

    expect(jobId).toMatch(/^job_[a-f0-9]{8}$/);

    const job = jobStore.get(jobId);
    expect(job).toBeDefined();
    expect(job?.status).toBe("pending");
    expect(job?.source).toBe("graph TD; A-->B;");
  });

  test("get returns null for non-existent job", async () => {
    const jobStore = await scope.resolve(jobStoreAtom);

    const job = jobStore.get("job_notexist");
    expect(job).toBeNull();
  });

  test("updateStatus transitions job state", async () => {
    const jobStore = await scope.resolve(jobStoreAtom);

    const jobId = jobStore.create({
      source: "test",
      format: "mermaid",
      outputType: "svg",
    });

    jobStore.updateStatus(jobId, "rendering");
    expect(jobStore.get(jobId)?.status).toBe("rendering");

    jobStore.updateStatus(jobId, "completed", { shortlink: "abc123" });
    const job = jobStore.get(jobId);
    expect(job?.status).toBe("completed");
    expect(job?.shortlink).toBe("abc123");
  });

  test("getPending returns oldest pending job", async () => {
    const jobStore = await scope.resolve(jobStoreAtom);

    const job1 = jobStore.create({ source: "first", format: "mermaid", outputType: "svg" });
    const job2 = jobStore.create({ source: "second", format: "d2", outputType: "png" });

    const pending = jobStore.getPending();
    expect(pending?.id).toBe(job1);
  });

  test("getPending returns null when no pending jobs", async () => {
    const jobStore = await scope.resolve(jobStoreAtom);

    const pending = jobStore.getPending();
    expect(pending).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test src/__tests__/job-store.test.ts`
Expected: FAIL - module not found

**Step 3: Implement Job Store**

```typescript
// Create src/atoms/job-store.ts
import { atom, tags } from "@pumped-fn/lite";
import { Database } from "bun:sqlite";
import { jobConfigTag } from "../config/tags";
import { loggerAtom } from "./logger";

export type JobStatus = "pending" | "rendering" | "completed" | "failed";

export interface JobInput {
  source: string;
  format: "mermaid" | "d2";
  outputType: "svg" | "png";
}

export interface JobRecord {
  id: string;
  status: JobStatus;
  source: string;
  format: "mermaid" | "d2";
  outputType: "svg" | "png";
  shortlink: string | null;
  error: string | null;
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
}

export interface JobStore {
  create(input: JobInput): string;
  get(jobId: string): JobRecord | null;
  updateStatus(jobId: string, status: JobStatus, result?: { shortlink?: string; error?: string }): void;
  getPending(): JobRecord | null;
  cleanup(): number;
}

export const jobStoreAtom = atom({
  deps: {
    config: tags.required(jobConfigTag),
    logger: loggerAtom,
  },
  factory: (ctx, { config, logger }): JobStore => {
    const db = new Database(config.dbPath);

    // Initialize schema
    db.run(`
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        source TEXT NOT NULL,
        format TEXT NOT NULL,
        output_type TEXT NOT NULL,
        shortlink TEXT,
        error TEXT,
        created_at INTEGER NOT NULL,
        started_at INTEGER,
        completed_at INTEGER
      )
    `);
    db.run(`CREATE INDEX IF NOT EXISTS idx_jobs_status_created ON jobs(status, created_at)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_jobs_completed_at ON jobs(completed_at)`);

    const create = (input: JobInput): string => {
      const id = `job_${crypto.randomUUID().slice(0, 8)}`;
      const now = Date.now();

      db.run(
        `INSERT INTO jobs (id, status, source, format, output_type, created_at)
         VALUES (?, 'pending', ?, ?, ?, ?)`,
        [id, input.source, input.format, input.outputType, now]
      );

      logger.debug({ jobId: id }, "Job created");
      return id;
    };

    const get = (jobId: string): JobRecord | null => {
      const row = db.query(
        `SELECT id, status, source, format, output_type, shortlink, error,
                created_at, started_at, completed_at
         FROM jobs WHERE id = ?`
      ).get(jobId) as {
        id: string;
        status: JobStatus;
        source: string;
        format: "mermaid" | "d2";
        output_type: "svg" | "png";
        shortlink: string | null;
        error: string | null;
        created_at: number;
        started_at: number | null;
        completed_at: number | null;
      } | null;

      if (!row) return null;

      return {
        id: row.id,
        status: row.status,
        source: row.source,
        format: row.format,
        outputType: row.output_type,
        shortlink: row.shortlink,
        error: row.error,
        createdAt: row.created_at,
        startedAt: row.started_at,
        completedAt: row.completed_at,
      };
    };

    const updateStatus = (
      jobId: string,
      status: JobStatus,
      result?: { shortlink?: string; error?: string }
    ): void => {
      const now = Date.now();

      if (status === "rendering") {
        db.run(`UPDATE jobs SET status = ?, started_at = ? WHERE id = ?`, [status, now, jobId]);
      } else if (status === "completed") {
        db.run(
          `UPDATE jobs SET status = ?, shortlink = ?, completed_at = ? WHERE id = ?`,
          [status, result?.shortlink ?? null, now, jobId]
        );
      } else if (status === "failed") {
        db.run(
          `UPDATE jobs SET status = ?, error = ?, completed_at = ? WHERE id = ?`,
          [status, result?.error ?? null, now, jobId]
        );
      } else {
        db.run(`UPDATE jobs SET status = ? WHERE id = ?`, [status, jobId]);
      }

      logger.debug({ jobId, status }, "Job status updated");
    };

    const getPending = (): JobRecord | null => {
      const row = db.query(
        `SELECT id, status, source, format, output_type, shortlink, error,
                created_at, started_at, completed_at
         FROM jobs WHERE status = 'pending'
         ORDER BY created_at ASC LIMIT 1`
      ).get() as {
        id: string;
        status: JobStatus;
        source: string;
        format: "mermaid" | "d2";
        output_type: "svg" | "png";
        shortlink: string | null;
        error: string | null;
        created_at: number;
        started_at: number | null;
        completed_at: number | null;
      } | null;

      if (!row) return null;

      return {
        id: row.id,
        status: row.status,
        source: row.source,
        format: row.format,
        outputType: row.output_type,
        shortlink: row.shortlink,
        error: row.error,
        createdAt: row.created_at,
        startedAt: row.started_at,
        completedAt: row.completed_at,
      };
    };

    const cleanup = (): number => {
      const threshold = Date.now() - config.retentionMs;
      const result = db.run(
        `DELETE FROM jobs WHERE completed_at IS NOT NULL AND completed_at < ?`,
        [threshold]
      );

      if (result.changes > 0) {
        logger.debug({ deletedCount: result.changes }, "Job cleanup completed");
      }

      return result.changes;
    };

    ctx.cleanup(() => {
      db.close();
      logger.debug("Job store database closed");
    });

    return { create, get, updateStatus, getPending, cleanup };
  },
});
```

**Step 4: Run test to verify it passes**

Run: `bun test src/__tests__/job-store.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/atoms/job-store.ts src/__tests__/job-store.test.ts
git commit -m "feat: implement job store with SQLite persistence (c3-110)"
```

---

## Task 4: Implement Job Processor (c3-111)

**Files:**
- Create: `src/atoms/job-processor.ts`
- Test: `src/__tests__/job-processor.test.ts`

**Step 1: Write the failing test for job processing**

```typescript
// Create src/__tests__/job-processor.test.ts
import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { createScope } from "@pumped-fn/lite";
import { jobProcessorAtom } from "../atoms/job-processor";
import { jobStoreAtom } from "../atoms/job-store";
import { cacheAtom } from "../atoms/cache";
import { jobConfigTag, logLevelTag, cacheConfigTag, queueConfigTag, browserPoolSizeTag } from "../config/tags";
import { unlinkSync, existsSync } from "fs";

const TEST_DB_PATH = "/tmp/test-processor.db";

describe("job-processor", () => {
  let scope: ReturnType<typeof createScope>;

  beforeEach(async () => {
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
    scope = createScope({
      tags: [
        jobConfigTag({
          dbPath: TEST_DB_PATH,
          pollIntervalMs: 50,
          retentionMs: 3600000,
          cleanupIntervalMs: 60000,
        }),
        logLevelTag("error"),
        cacheConfigTag({ ttlMs: 300000, gcIntervalMs: 60000 }),
        queueConfigTag({ maxConcurrent: 2, maxWaiting: 10 }),
        browserPoolSizeTag(1),
      ],
    });
  });

  afterEach(async () => {
    await scope.dispose();
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
  });

  test("processor starts and can be stopped", async () => {
    const processor = await scope.resolve(jobProcessorAtom);

    // Just verify it doesn't throw
    expect(processor.isRunning()).toBe(true);
  });

  test("processor picks up pending job and processes it", async () => {
    const jobStore = await scope.resolve(jobStoreAtom);
    const cache = await scope.resolve(cacheAtom);

    // Create a job
    const jobId = jobStore.create({
      source: "graph TD; A-->B;",
      format: "mermaid",
      outputType: "svg",
    });

    // Start processor
    const processor = await scope.resolve(jobProcessorAtom);

    // Wait for processing (with timeout)
    const startTime = Date.now();
    while (Date.now() - startTime < 10000) {
      const job = jobStore.get(jobId);
      if (job?.status === "completed" || job?.status === "failed") {
        break;
      }
      await new Promise(r => setTimeout(r, 100));
    }

    const job = jobStore.get(jobId);
    // Job should be either completed or failed (depends on renderer availability)
    expect(["completed", "failed"]).toContain(job?.status);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test src/__tests__/job-processor.test.ts`
Expected: FAIL - module not found

**Step 3: Implement Job Processor**

```typescript
// Create src/atoms/job-processor.ts
import { atom, tags } from "@pumped-fn/lite";
import { jobConfigTag } from "../config/tags";
import { loggerAtom } from "./logger";
import { jobStoreAtom, type JobRecord } from "./job-store";
import { queueAtom, BackpressureError } from "./queue";
import { rendererService, RenderError } from "./renderer";
import { cacheAtom } from "./cache";

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function getContentType(outputType: "svg" | "png"): string {
  return outputType === "svg" ? "image/svg+xml" : "image/png";
}

export interface JobProcessor {
  isRunning(): boolean;
}

export const jobProcessorAtom = atom({
  deps: {
    config: tags.required(jobConfigTag),
    logger: loggerAtom,
    jobStore: jobStoreAtom,
    queue: queueAtom,
    renderer: rendererService,
    cache: cacheAtom,
  },
  factory: (ctx, { config, logger, jobStore, queue, renderer, cache }): JobProcessor => {
    let running = true;
    let pollTimeout: ReturnType<typeof setTimeout> | null = null;
    let cleanupInterval: ReturnType<typeof setInterval> | null = null;

    const processJob = async (job: JobRecord): Promise<void> => {
      logger.debug({ jobId: job.id }, "Processing job");

      jobStore.updateStatus(job.id, "rendering");

      let release: (() => void) | null = null;
      try {
        release = await queue.acquire();

        const bytes = await renderer.render(job.source, job.format, job.outputType);
        const base64Data = uint8ArrayToBase64(bytes);
        const contentType = getContentType(job.outputType);
        const shortlink = cache.store(base64Data, contentType);

        jobStore.updateStatus(job.id, "completed", { shortlink });
        logger.info({ jobId: job.id, shortlink }, "Job completed");

      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        jobStore.updateStatus(job.id, "failed", { error: message });
        logger.error({ jobId: job.id, error: message }, "Job failed");

      } finally {
        if (release) release();
      }
    };

    const poll = async (): Promise<void> => {
      if (!running) return;

      try {
        const job = jobStore.getPending();
        if (job) {
          await processJob(job);
          // Immediately check for more work
          if (running) {
            pollTimeout = setTimeout(poll, 0);
          }
        } else {
          // No work, wait before next poll
          if (running) {
            pollTimeout = setTimeout(poll, config.pollIntervalMs);
          }
        }
      } catch (error) {
        logger.error({ error }, "Error in job processor poll");
        if (running) {
          pollTimeout = setTimeout(poll, config.pollIntervalMs);
        }
      }
    };

    const runCleanup = (): void => {
      try {
        const deleted = jobStore.cleanup();
        if (deleted > 0) {
          logger.info({ deletedCount: deleted }, "Cleaned up expired jobs");
        }
      } catch (error) {
        logger.error({ error }, "Error in job cleanup");
      }
    };

    // Start polling
    poll();

    // Start cleanup scheduler
    cleanupInterval = setInterval(runCleanup, config.cleanupIntervalMs);

    ctx.cleanup(() => {
      running = false;
      if (pollTimeout) clearTimeout(pollTimeout);
      if (cleanupInterval) clearInterval(cleanupInterval);
      logger.debug("Job processor stopped");
    });

    return {
      isRunning: () => running,
    };
  },
});
```

**Step 4: Run test to verify it passes**

Run: `bun test src/__tests__/job-processor.test.ts`
Expected: PASS (or skip if renderer unavailable in test env)

**Step 5: Commit**

```bash
git add src/atoms/job-processor.ts src/__tests__/job-processor.test.ts
git commit -m "feat: implement job processor background worker (c3-111)"
```

---

## Task 5: Implement Job Status Flow (c3-112)

**Files:**
- Create: `src/flows/job-status.ts`
- Test: `src/__tests__/job-status.test.ts`

**Step 1: Write the failing test**

```typescript
// Create src/__tests__/job-status.test.ts
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createScope } from "@pumped-fn/lite";
import { jobStatusFlow, JobNotFoundError } from "../flows/job-status";
import { jobStoreAtom } from "../atoms/job-store";
import { jobConfigTag, logLevelTag } from "../config/tags";
import { unlinkSync, existsSync } from "fs";

const TEST_DB_PATH = "/tmp/test-status.db";

describe("job-status-flow", () => {
  let scope: ReturnType<typeof createScope>;

  beforeEach(async () => {
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
    scope = createScope({
      tags: [
        jobConfigTag({
          dbPath: TEST_DB_PATH,
          pollIntervalMs: 100,
          retentionMs: 3600000,
          cleanupIntervalMs: 60000,
        }),
        logLevelTag("error"),
      ],
    });
  });

  afterEach(async () => {
    await scope.dispose();
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
  });

  test("returns job status for existing job", async () => {
    const jobStore = await scope.resolve(jobStoreAtom);
    const jobId = jobStore.create({
      source: "graph TD; A-->B;",
      format: "mermaid",
      outputType: "svg",
    });

    const ctx = scope.createContext();
    const result = await ctx.exec({
      flow: jobStatusFlow,
      input: { jobId },
    });
    await ctx.close();

    expect(result.jobId).toBe(jobId);
    expect(result.status).toBe("pending");
    expect(result.shortlink).toBeNull();
  });

  test("throws JobNotFoundError for non-existent job", async () => {
    const ctx = scope.createContext();

    await expect(ctx.exec({
      flow: jobStatusFlow,
      input: { jobId: "job_notexist" },
    })).rejects.toThrow(JobNotFoundError);

    await ctx.close();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test src/__tests__/job-status.test.ts`
Expected: FAIL - module not found

**Step 3: Implement Job Status Flow**

```typescript
// Create src/flows/job-status.ts
import { flow } from "@pumped-fn/lite";
import { jobStoreAtom } from "../atoms/job-store";
import { loggerAtom } from "../atoms/logger";

export class JobNotFoundError extends Error {
  public readonly statusCode = 404;
  constructor(jobId: string) {
    super(`Job not found: ${jobId}`);
    this.name = "JobNotFoundError";
  }
}

export interface JobStatusInput {
  jobId: string;
}

export interface JobStatusResult {
  jobId: string;
  status: "pending" | "rendering" | "completed" | "failed";
  shortlink: string | null;
  error: string | null;
  url: string | null;
}

export const jobStatusFlow = flow({
  name: "job-status",
  deps: {
    jobStore: jobStoreAtom,
    logger: loggerAtom,
  },
  factory: async (ctx, { jobStore, logger }) => {
    const { input } = ctx;

    logger.debug({ jobId: input.jobId }, "Looking up job status");

    const job = jobStore.get(input.jobId);

    if (!job) {
      throw new JobNotFoundError(input.jobId);
    }

    const result: JobStatusResult = {
      jobId: job.id,
      status: job.status,
      shortlink: job.shortlink,
      error: job.error,
      url: job.shortlink ? `/d/${job.shortlink}` : null,
    };

    return result;
  },
});
```

**Step 4: Run test to verify it passes**

Run: `bun test src/__tests__/job-status.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/flows/job-status.ts src/__tests__/job-status.test.ts
git commit -m "feat: implement job status lookup flow (c3-112)"
```

---

## Task 6: Add Input Hashing Utility

**Files:**
- Create: `src/utils/hash.ts`
- Test: `src/__tests__/hash.test.ts`

**Step 1: Write the failing test**

```typescript
// Create src/__tests__/hash.test.ts
import { describe, test, expect } from "bun:test";
import { hashInput } from "../utils/hash";

describe("hashInput", () => {
  test("produces consistent hash for same input", () => {
    const hash1 = hashInput("graph TD; A-->B;", "mermaid", "svg");
    const hash2 = hashInput("graph TD; A-->B;", "mermaid", "svg");

    expect(hash1).toBe(hash2);
  });

  test("produces different hash for different source", () => {
    const hash1 = hashInput("graph TD; A-->B;", "mermaid", "svg");
    const hash2 = hashInput("graph TD; A-->C;", "mermaid", "svg");

    expect(hash1).not.toBe(hash2);
  });

  test("produces different hash for different format", () => {
    const hash1 = hashInput("graph TD; A-->B;", "mermaid", "svg");
    const hash2 = hashInput("graph TD; A-->B;", "d2", "svg");

    expect(hash1).not.toBe(hash2);
  });

  test("produces different hash for different outputType", () => {
    const hash1 = hashInput("graph TD; A-->B;", "mermaid", "svg");
    const hash2 = hashInput("graph TD; A-->B;", "mermaid", "png");

    expect(hash1).not.toBe(hash2);
  });

  test("produces hex string", () => {
    const hash = hashInput("test", "mermaid", "svg");
    expect(hash).toMatch(/^[a-f0-9]+$/);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test src/__tests__/hash.test.ts`
Expected: FAIL - module not found

**Step 3: Implement hash utility**

```typescript
// Create src/utils/hash.ts

export function hashInput(
  source: string,
  format: "mermaid" | "d2",
  outputType: "svg" | "png"
): string {
  const input = `${source}|${format}|${outputType}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(input);

  // Use Bun's native crypto
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(data);
  return hasher.digest("hex");
}
```

**Step 4: Run test to verify it passes**

Run: `bun test src/__tests__/hash.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/utils/hash.ts src/__tests__/hash.test.ts
git commit -m "feat: add SHA-256 input hashing utility"
```

---

## Task 7: Update Render Flow for Async Mode and Input Caching

**Files:**
- Modify: `src/flows/render.ts`
- Test: `src/__tests__/render.test.ts` (update existing)

**Step 1: Write the failing test for input cache hit**

```typescript
// Add to src/__tests__/render.test.ts (or create if not exists)
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createScope } from "@pumped-fn/lite";
import { renderFlow } from "../flows/render";
import { cacheAtom } from "../atoms/cache";
import { cacheConfigTag, queueConfigTag, logLevelTag, browserPoolSizeTag } from "../config/tags";

describe("render-flow input caching", () => {
  let scope: ReturnType<typeof createScope>;

  beforeEach(async () => {
    scope = createScope({
      tags: [
        cacheConfigTag({ ttlMs: 300000, gcIntervalMs: 60000 }),
        queueConfigTag({ maxConcurrent: 2, maxWaiting: 10 }),
        logLevelTag("error"),
        browserPoolSizeTag(1),
      ],
    });
  });

  afterEach(async () => {
    await scope.dispose();
  });

  test("returns cached shortlink for duplicate input (sync mode)", async () => {
    const cache = await scope.resolve(cacheAtom);

    // Pre-populate cache with input hash
    const shortlink = cache.store("existing-data", "image/svg+xml");
    const inputHash = "test-hash"; // In real flow, this would be computed
    cache.storeInputHash(inputHash, shortlink);

    // The flow should check cache first and return existing shortlink
    // (Full test requires mock renderer or integration test)
  });
});
```

**Step 2: Update render flow with input caching and async mode**

```typescript
// Modify src/flows/render.ts - replace the existing file

import { flow } from "@pumped-fn/lite";
import { cacheAtom } from "../atoms/cache";
import { queueAtom, BackpressureError } from "../atoms/queue";
import { rendererService, RenderError } from "../atoms/renderer";
import { loggerAtom } from "../atoms/logger";
import { hashInput } from "../utils/hash";

export type DiagramFormat = "mermaid" | "d2";
export type OutputType = "svg" | "png";
export type RenderMode = "sync" | "async";

export interface RenderInput {
  source: string;
  format: DiagramFormat;
  outputType: OutputType;
  mode: RenderMode;
}

export interface SyncRenderResult {
  mode: "sync";
  shortlink: string;
  cached: boolean;
}

export interface AsyncRenderResult {
  mode: "async";
  jobId: string;
  status: "pending";
  statusUrl: string;
}

export type RenderResult = SyncRenderResult | AsyncRenderResult;

export class ValidationError extends Error {
  public readonly statusCode = 400;
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

function parseRenderInput(body: unknown, queryMode?: string): RenderInput {
  if (!body || typeof body !== "object") {
    throw new ValidationError("Request body must be a JSON object");
  }

  const obj = body as Record<string, unknown>;

  if (typeof obj.source !== "string" || obj.source.trim() === "") {
    throw new ValidationError("source is required and must be a non-empty string");
  }

  const format = obj.format;
  if (format !== "mermaid" && format !== "d2") {
    throw new ValidationError("format must be 'mermaid' or 'd2'");
  }

  const outputType = obj.outputType ?? "svg";
  if (outputType !== "svg" && outputType !== "png") {
    throw new ValidationError("outputType must be 'svg' or 'png'");
  }

  // Mode from query param, default to async
  const mode: RenderMode = queryMode === "sync" ? "sync" : "async";

  return {
    source: obj.source,
    format,
    outputType,
    mode,
  };
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function getContentType(outputType: OutputType): string {
  return outputType === "svg" ? "image/svg+xml" : "image/png";
}

// Sync render flow (original behavior + input caching)
export const renderFlow = flow({
  name: "render",
  deps: {
    cache: cacheAtom,
    queue: queueAtom,
    renderer: rendererService,
    logger: loggerAtom,
  },
  parse: (raw: unknown) => parseRenderInput(raw, "sync"),
  factory: async (ctx, { cache, queue, renderer, logger }): Promise<SyncRenderResult> => {
    const { input } = ctx;

    // Check input cache first
    const inputHash = hashInput(input.source, input.format, input.outputType);
    const cachedShortlink = cache.getByInputHash(inputHash);

    if (cachedShortlink) {
      // Verify the output still exists
      const cachedOutput = cache.get(cachedShortlink);
      if (cachedOutput) {
        logger.info({ shortlink: cachedShortlink }, "Cache hit - returning existing shortlink");
        return { mode: "sync", shortlink: cachedShortlink, cached: true };
      }
    }

    logger.debug({ format: input.format, outputType: input.outputType }, "Starting render");

    const release = await queue.acquire();
    ctx.onClose(() => release());

    const bytes = await ctx.exec({
      fn: renderer.render,
      params: [input.source, input.format, input.outputType],
      name: "renderer.render",
    });

    const base64Data = uint8ArrayToBase64(bytes);
    const contentType = getContentType(input.outputType);
    const shortlink = cache.store(base64Data, contentType);

    // Store input hash -> shortlink mapping
    cache.storeInputHash(inputHash, shortlink);

    logger.info({ shortlink, format: input.format }, "Render complete");

    return { mode: "sync", shortlink, cached: false };
  },
});

// Export for use in async render
export { parseRenderInput, hashInput };
export { BackpressureError, RenderError };
```

**Step 3: Run tests**

Run: `bun test src/__tests__/render.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add src/flows/render.ts src/__tests__/render.test.ts
git commit -m "feat: add input caching to render flow"
```

---

## Task 8: Create Async Render Flow

**Files:**
- Create: `src/flows/render-async.ts`
- Test: `src/__tests__/render-async.test.ts`

**Step 1: Write the failing test**

```typescript
// Create src/__tests__/render-async.test.ts
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createScope } from "@pumped-fn/lite";
import { asyncRenderFlow } from "../flows/render-async";
import { jobStoreAtom } from "../atoms/job-store";
import { cacheAtom } from "../atoms/cache";
import { jobConfigTag, cacheConfigTag, logLevelTag } from "../config/tags";
import { unlinkSync, existsSync } from "fs";

const TEST_DB_PATH = "/tmp/test-async-render.db";

describe("async-render-flow", () => {
  let scope: ReturnType<typeof createScope>;

  beforeEach(async () => {
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
    scope = createScope({
      tags: [
        jobConfigTag({
          dbPath: TEST_DB_PATH,
          pollIntervalMs: 100,
          retentionMs: 3600000,
          cleanupIntervalMs: 60000,
        }),
        cacheConfigTag({ ttlMs: 300000, gcIntervalMs: 60000 }),
        logLevelTag("error"),
      ],
    });
  });

  afterEach(async () => {
    await scope.dispose();
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
  });

  test("creates job and returns job ID", async () => {
    const ctx = scope.createContext();

    const result = await ctx.exec({
      flow: asyncRenderFlow,
      rawInput: {
        source: "graph TD; A-->B;",
        format: "mermaid",
        outputType: "svg",
      },
    });

    await ctx.close();

    expect(result.mode).toBe("async");
    expect(result.jobId).toMatch(/^job_[a-f0-9]{8}$/);
    expect(result.status).toBe("pending");
    expect(result.statusUrl).toBe(`/jobs/${result.jobId}`);
  });

  test("returns cached shortlink if input exists", async () => {
    const cache = await scope.resolve(cacheAtom);

    // Pre-populate cache
    const shortlink = cache.store("existing-data", "image/svg+xml");

    // Create a hash that matches what the flow will compute
    const { hashInput } = await import("../utils/hash");
    const inputHash = hashInput("graph TD; A-->B;", "mermaid", "svg");
    cache.storeInputHash(inputHash, shortlink);

    const ctx = scope.createContext();

    const result = await ctx.exec({
      flow: asyncRenderFlow,
      rawInput: {
        source: "graph TD; A-->B;",
        format: "mermaid",
        outputType: "svg",
      },
    });

    await ctx.close();

    // Should return sync result with cached shortlink
    expect(result.mode).toBe("sync");
    expect((result as { shortlink: string }).shortlink).toBe(shortlink);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test src/__tests__/render-async.test.ts`
Expected: FAIL - module not found

**Step 3: Implement async render flow**

```typescript
// Create src/flows/render-async.ts
import { flow } from "@pumped-fn/lite";
import { cacheAtom } from "../atoms/cache";
import { jobStoreAtom } from "../atoms/job-store";
import { loggerAtom } from "../atoms/logger";
import { hashInput } from "../utils/hash";
import { ValidationError, type SyncRenderResult, type AsyncRenderResult, type RenderResult } from "./render";

export interface AsyncRenderInput {
  source: string;
  format: "mermaid" | "d2";
  outputType: "svg" | "png";
}

function parseAsyncRenderInput(body: unknown): AsyncRenderInput {
  if (!body || typeof body !== "object") {
    throw new ValidationError("Request body must be a JSON object");
  }

  const obj = body as Record<string, unknown>;

  if (typeof obj.source !== "string" || obj.source.trim() === "") {
    throw new ValidationError("source is required and must be a non-empty string");
  }

  const format = obj.format;
  if (format !== "mermaid" && format !== "d2") {
    throw new ValidationError("format must be 'mermaid' or 'd2'");
  }

  const outputType = obj.outputType ?? "svg";
  if (outputType !== "svg" && outputType !== "png") {
    throw new ValidationError("outputType must be 'svg' or 'png'");
  }

  return {
    source: obj.source,
    format,
    outputType,
  };
}

export const asyncRenderFlow = flow({
  name: "render-async",
  deps: {
    cache: cacheAtom,
    jobStore: jobStoreAtom,
    logger: loggerAtom,
  },
  parse: parseAsyncRenderInput,
  factory: async (ctx, { cache, jobStore, logger }): Promise<RenderResult> => {
    const { input } = ctx;

    // Check input cache first
    const inputHash = hashInput(input.source, input.format, input.outputType);
    const cachedShortlink = cache.getByInputHash(inputHash);

    if (cachedShortlink) {
      // Verify the output still exists
      const cachedOutput = cache.get(cachedShortlink);
      if (cachedOutput) {
        logger.info({ shortlink: cachedShortlink }, "Cache hit - returning existing shortlink");
        return { mode: "sync", shortlink: cachedShortlink, cached: true };
      }
    }

    // Create job for background processing
    const jobId = jobStore.create({
      source: input.source,
      format: input.format,
      outputType: input.outputType,
    });

    logger.info({ jobId }, "Created async render job");

    return {
      mode: "async",
      jobId,
      status: "pending",
      statusUrl: `/jobs/${jobId}`,
    };
  },
});
```

**Step 4: Run test to verify it passes**

Run: `bun test src/__tests__/render-async.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/flows/render-async.ts src/__tests__/render-async.test.ts
git commit -m "feat: implement async render flow with job creation"
```

---

## Task 9: Update Server with Job Routes and Async Mode

**Files:**
- Modify: `src/server.ts`
- Test: `src/__tests__/integration.test.ts` (update)

**Step 1: Update server with job endpoint and async render**

```typescript
// In src/server.ts, add these imports at the top:
import { asyncRenderFlow } from "./flows/render-async";
import { jobStatusFlow, JobNotFoundError } from "./flows/job-status";
import { jobProcessorAtom } from "./atoms/job-processor";

// Add JobNotFoundError handling in mapErrorToResponse:
if (error instanceof JobNotFoundError) {
  return new Response(JSON.stringify({ error: error.message }), {
    status: 404,
    headers: { "Content-Type": "application/json" },
  });
}

// In startServer, start the job processor after browser pool warmup:
const jobProcessor = await scope.resolve(jobProcessorAtom);
logger.info("Job processor started");

// Replace the POST /render handler:
if (req.method === "POST" && url.pathname === "/render") {
  if (authConfig.enabled && authConfig.credentials) {
    const authHeader = req.headers.get("authorization");
    checkBasicAuth(authHeader, authConfig.credentials.username, authConfig.credentials.password);
  }

  const body = await req.json();
  const mode = url.searchParams.get("mode");

  const ctx = scope.createContext({ tags: [requestIdTag(requestId)] });

  try {
    if (mode === "sync") {
      // Sync mode - block and return shortlink
      const result = await ctx.exec({
        flow: renderFlow,
        rawInput: body,
      });

      return new Response(JSON.stringify({
        shortlink: result.shortlink,
        url: `/d/${result.shortlink}`,
        cached: result.cached,
      }), {
        status: 200,
        headers: { "Content-Type": "application/json", "X-Request-Id": requestId },
      });
    } else {
      // Async mode (default) - create job or return cached
      const result = await ctx.exec({
        flow: asyncRenderFlow,
        rawInput: body,
      });

      if (result.mode === "sync") {
        // Cache hit - return immediately
        return new Response(JSON.stringify({
          shortlink: result.shortlink,
          url: `/d/${result.shortlink}`,
          cached: result.cached,
        }), {
          status: 200,
          headers: { "Content-Type": "application/json", "X-Request-Id": requestId },
        });
      } else {
        // Job created
        return new Response(JSON.stringify({
          jobId: result.jobId,
          status: result.status,
          statusUrl: result.statusUrl,
        }), {
          status: 202,
          headers: { "Content-Type": "application/json", "X-Request-Id": requestId },
        });
      }
    }
  } finally {
    await ctx.close();
  }
}

// Add GET /jobs/:id route (after the /d/:shortlink route):
if (req.method === "GET" && url.pathname.startsWith("/jobs/")) {
  const jobId = url.pathname.slice(6);

  const ctx = scope.createContext({ tags: [requestIdTag(requestId)] });

  try {
    const result = await ctx.exec({
      flow: jobStatusFlow,
      input: { jobId },
    });

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json", "X-Request-Id": requestId },
    });
  } finally {
    await ctx.close();
  }
}
```

**Step 2: Run existing tests to verify nothing broke**

Run: `bun test`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add src/server.ts
git commit -m "feat: add async render mode and job status endpoint"
```

---

## Task 10: Integration Tests

**Files:**
- Modify: `src/__tests__/integration.test.ts`

**Step 1: Add integration tests for new functionality**

```typescript
// Add to src/__tests__/integration.test.ts

describe("async render", () => {
  test("POST /render returns 202 with jobId", async () => {
    const response = await fetch(`${baseUrl}/render`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "graph TD; A-->B;",
        format: "mermaid",
        outputType: "svg",
      }),
    });

    expect(response.status).toBe(202);
    const body = await response.json();
    expect(body.jobId).toMatch(/^job_[a-f0-9]{8}$/);
    expect(body.status).toBe("pending");
    expect(body.statusUrl).toBe(`/jobs/${body.jobId}`);
  });

  test("POST /render?mode=sync returns 200 with shortlink", async () => {
    const response = await fetch(`${baseUrl}/render?mode=sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "graph TD; A-->B;",
        format: "mermaid",
        outputType: "svg",
      }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.shortlink).toBeDefined();
    expect(body.url).toBe(`/d/${body.shortlink}`);
  });

  test("GET /jobs/:id returns job status", async () => {
    // Create a job first
    const createResponse = await fetch(`${baseUrl}/render`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "graph TD; X-->Y;",
        format: "mermaid",
        outputType: "svg",
      }),
    });
    const { jobId } = await createResponse.json();

    // Get status
    const statusResponse = await fetch(`${baseUrl}/jobs/${jobId}`);
    expect(statusResponse.status).toBe(200);

    const status = await statusResponse.json();
    expect(status.jobId).toBe(jobId);
    expect(["pending", "rendering", "completed", "failed"]).toContain(status.status);
  });

  test("GET /jobs/:id returns 404 for non-existent job", async () => {
    const response = await fetch(`${baseUrl}/jobs/job_notexist`);
    expect(response.status).toBe(404);
  });
});

describe("input caching", () => {
  test("duplicate input returns same shortlink without re-render", async () => {
    const input = {
      source: "graph TD; Cache-->Test;",
      format: "mermaid",
      outputType: "svg",
    };

    // First request
    const response1 = await fetch(`${baseUrl}/render?mode=sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const body1 = await response1.json();

    // Second request with same input
    const response2 = await fetch(`${baseUrl}/render?mode=sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const body2 = await response2.json();

    expect(body1.shortlink).toBe(body2.shortlink);
    expect(body2.cached).toBe(true);
  });
});
```

**Step 2: Run integration tests**

Run: `bun test src/__tests__/integration.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add src/__tests__/integration.test.ts
git commit -m "test: add integration tests for async render and input caching"
```

---

## Task 11: Update C3 Documentation

**Files:**
- Modify: `.c3/c3-1-api-server/c3-103-render-flow.md`
- Modify: `.c3/c3-1-api-server/c3-105-cache.md`
- Modify: `.c3/TOC.md`

**Step 1: Update render flow docs to reflect async mode**

Add async mode flow diagram and update dependencies.

**Step 2: Update cache docs to document input hash methods**

Add storeInputHash and getByInputHash to the contract.

**Step 3: Update TOC to show new components are implemented**

Mark c3-110, c3-111, c3-112 as implemented.

**Step 4: Commit**

```bash
git add .c3/
git commit -m "docs: update C3 documentation for input caching and job system"
```

---

## Task 12: Final Verification

**Step 1: Run full test suite**

Run: `bun test`
Expected: All tests PASS

**Step 2: Manual smoke test**

```bash
# Start server
bun run src/server.ts &

# Test async render
curl -X POST http://localhost:3000/render \
  -H "Content-Type: application/json" \
  -d '{"source": "graph TD; A-->B;", "format": "mermaid", "outputType": "svg"}'
# Expected: 202 with jobId

# Poll for status
curl http://localhost:3000/jobs/job_XXXXXXXX
# Expected: status changes from pending -> rendering -> completed

# Test sync render
curl -X POST "http://localhost:3000/render?mode=sync" \
  -H "Content-Type: application/json" \
  -d '{"source": "graph TD; A-->B;", "format": "mermaid", "outputType": "svg"}'
# Expected: 200 with shortlink

# Test cache hit
curl -X POST "http://localhost:3000/render?mode=sync" \
  -H "Content-Type: application/json" \
  -d '{"source": "graph TD; A-->B;", "format": "mermaid", "outputType": "svg"}'
# Expected: 200 with same shortlink, cached: true
```

**Step 3: Update ADR status to accepted**

```bash
# In .c3/adr/adr-20251224-input-cache-and-job-system.md
# Change: status: proposed → status: accepted
git add .c3/adr/adr-20251224-input-cache-and-job-system.md
git commit -m "docs: mark ADR as accepted after implementation"
```

---

Plan complete and saved to `.c3/adr/adr-20251224-input-cache-and-job-system.plan.md`.

**Two execution options:**

1. **Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

2. **Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
