import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createScope } from "@pumped-fn/lite";
import { jobStatusFlow, JobNotFoundError } from "../flows/job-status";
import { jobStoreAtom } from "../atoms/job-store";
import { jobConfigTag, logLevelTag, baseUrlTag } from "../config/tags";
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
      rawInput: { jobId },
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
      rawInput: { jobId: "job_notexist" },
    })).rejects.toThrow(JobNotFoundError);

    await ctx.close();
  });

  test("uses BASE_URL in result url when job is completed", async () => {
    const scopeWithBaseUrl = createScope({
      tags: [
        jobConfigTag({
          dbPath: TEST_DB_PATH,
          pollIntervalMs: 100,
          retentionMs: 3600000,
          cleanupIntervalMs: 60000,
        }),
        logLevelTag("error"),
        baseUrlTag("https://diagrams.example.com"),
      ],
    });

    const jobStore = await scopeWithBaseUrl.resolve(jobStoreAtom);
    const jobId = jobStore.create({
      source: "graph TD; A-->B;",
      format: "mermaid",
      outputType: "svg",
    });
    // Simulate completion
    jobStore.updateStatus(jobId, "completed", { shortlink: "abc12345" });

    const ctx = scopeWithBaseUrl.createContext();
    const result = await ctx.exec({
      flow: jobStatusFlow,
      rawInput: { jobId },
    });
    await ctx.close();
    await scopeWithBaseUrl.dispose();

    expect(result.url).toBe("https://diagrams.example.com/d/abc12345");
  });
});
