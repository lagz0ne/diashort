import { describe, test, expect, beforeEach, afterEach, setDefaultTimeout } from "bun:test";

setDefaultTimeout(20000);
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
    expect(processor.isRunning()).toBe(true);
  });

  test("processor picks up pending job and processes it", async () => {
    const jobStore = await scope.resolve(jobStoreAtom);

    // Create a job
    const jobId = jobStore.create({
      source: "graph TD; A-->B;",
      format: "mermaid",
      outputType: "svg",
    });

    // Verify job was created
    const initialJob = jobStore.get(jobId);
    expect(initialJob?.status).toBe("pending");

    // Start processor
    const processor = await scope.resolve(jobProcessorAtom);
    expect(processor.isRunning()).toBe(true);

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
    expect(job).not.toBeNull();
    expect(["completed", "failed"]).toContain(job!.status);
  });
});
