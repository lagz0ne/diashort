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

  test("cleanup removes old completed and failed jobs", async () => {
    // Create scope with short retention time for testing
    await scope.dispose();
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }

    scope = createScope({
      tags: [
        jobConfigTag({
          dbPath: TEST_DB_PATH,
          pollIntervalMs: 100,
          retentionMs: 1000, // 1 second retention
          cleanupIntervalMs: 60000,
        }),
        logLevelTag("error"),
      ],
    });

    const jobStore = await scope.resolve(jobStoreAtom);

    // Create jobs
    const job1 = jobStore.create({ source: "old", format: "mermaid", outputType: "svg" });
    const job2 = jobStore.create({ source: "new", format: "d2", outputType: "png" });
    const job3 = jobStore.create({ source: "pending", format: "mermaid", outputType: "svg" });

    // Mark first two as completed/failed
    jobStore.updateStatus(job1, "completed", { shortlink: "old123" });
    jobStore.updateStatus(job2, "failed", { error: "test error" });
    // job3 stays pending

    // Wait for retention period to pass
    await new Promise(resolve => setTimeout(resolve, 1100));

    // Run cleanup
    jobStore.cleanup();

    // Old completed and failed jobs should be removed
    expect(jobStore.get(job1)).toBeNull();
    expect(jobStore.get(job2)).toBeNull();

    // Pending job should remain
    expect(jobStore.get(job3)).toBeDefined();
    expect(jobStore.get(job3)?.status).toBe("pending");
  });
});
