import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createScope } from "@pumped-fn/lite";
import { asyncRenderFlow } from "../flows/render-async";
import { jobStoreAtom } from "../atoms/job-store";
import { cacheAtom } from "../atoms/cache";
import { jobConfigTag, cacheConfigTag, logLevelTag } from "../config/tags";
import { hashInput } from "../utils/hash";
import { unlinkSync, existsSync } from "fs";

const TEST_DB_PATH = "/tmp/test-async-render.db";

describe("async-render-flow", () => {
  let scope: ReturnType<typeof createScope>;

  beforeEach(async () => {
    if (existsSync(TEST_DB_PATH)) unlinkSync(TEST_DB_PATH);
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
    if (existsSync(TEST_DB_PATH)) unlinkSync(TEST_DB_PATH);
  });

  test("creates job and returns job ID when not cached", async () => {
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
    if (result.mode === "async") {
      expect(result.jobId).toMatch(/^job_[a-f0-9]{8}$/);
      expect(result.status).toBe("pending");
      expect(result.statusUrl).toBe(`/jobs/${result.jobId}`);
    }
  });

  test("returns cached shortlink if input exists", async () => {
    const cache = await scope.resolve(cacheAtom);

    // Pre-populate cache
    const shortlink = cache.store("existing-data", "image/svg+xml");
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

    expect(result.mode).toBe("sync");
    if (result.mode === "sync") {
      expect(result.shortlink).toBe(shortlink);
      expect(result.cached).toBe(true);
    }
  });
});
