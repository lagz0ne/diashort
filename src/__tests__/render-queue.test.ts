import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { createRenderQueue } from "../atoms/render-queue";
import { existsSync, unlinkSync } from "fs";

describe("RenderQueue", () => {
  // Unique DB per test for complete isolation
  let testDbPath: string;
  let db: Database;

  beforeEach(() => {
    // Create fresh DB for each test with guaranteed unique path
    testDbPath = `/tmp/render-queue-test-${crypto.randomUUID()}.db`;
    db = new Database(testDbPath);
  });

  afterEach(() => {
    // Clean up after each test - wrapped in try-catch for robustness
    try {
      db?.close();
      if (existsSync(testDbPath)) unlinkSync(testDbPath);
    } catch {
      // Ignore cleanup errors - file may already be deleted
    }
  });

  it("enqueues and claims a job", () => {
    const queue = createRenderQueue(db);

    const jobId = queue.enqueue("graph TD; A-->B");
    expect(jobId).toMatch(/^[a-f0-9-]{36}$/);

    const job = queue.claim("browser-1");
    expect(job).not.toBeNull();
    expect(job!.id).toBe(jobId);
    expect(job!.source).toBe("graph TD; A-->B");
  });

  it("returns null when claiming from empty queue", () => {
    const queue = createRenderQueue(db);

    const job = queue.claim("browser-1");
    expect(job).toBeNull();
  });

  it("claims jobs in FIFO order", () => {
    const queue = createRenderQueue(db);

    const id1 = queue.enqueue("first");
    const id2 = queue.enqueue("second");
    const id3 = queue.enqueue("third");

    const job1 = queue.claim("browser-1");
    const job2 = queue.claim("browser-1");
    const job3 = queue.claim("browser-1");

    expect(job1!.id).toBe(id1);
    expect(job2!.id).toBe(id2);
    expect(job3!.id).toBe(id3);
  });

  it("completes a job with correct browser ownership", () => {
    const queue = createRenderQueue(db);

    queue.enqueue("source");
    const job = queue.claim("browser-1");

    const completed = queue.complete(job!.id, "browser-1");
    expect(completed).toBe(true);

    // Job should no longer exist
    expect(queue.countProcessing()).toBe(0);
    expect(queue.countPending()).toBe(0);
  });

  it("rejects complete from wrong browser", () => {
    const queue = createRenderQueue(db);

    queue.enqueue("source");
    const job = queue.claim("browser-1");

    // Different browser tries to complete
    const completed = queue.complete(job!.id, "browser-2");
    expect(completed).toBe(false);

    // Job should still be processing
    expect(queue.countProcessing()).toBe(1);
  });

  it("retries a job up to maxRetries", () => {
    const queue = createRenderQueue(db, { maxRetries: 2 });

    queue.enqueue("source");

    // First attempt
    const job1 = queue.claim("browser-1");
    expect(queue.retry(job1!.id, "browser-1")).toBe(true);

    // Second attempt (retries = 1)
    const job2 = queue.claim("browser-1");
    expect(job2!.retries).toBe(1);
    expect(queue.retry(job2!.id, "browser-1")).toBe(true);

    // Third attempt (retries = 2, at max)
    const job3 = queue.claim("browser-1");
    expect(job3!.retries).toBe(2);
    // Cannot retry anymore
    expect(queue.retry(job3!.id, "browser-1")).toBe(false);
  });

  it("fails a job and removes it", () => {
    const queue = createRenderQueue(db);

    queue.enqueue("source");
    const job = queue.claim("browser-1");

    const failed = queue.fail(job!.id, "browser-1");
    expect(failed).toBe(true);

    expect(queue.countProcessing()).toBe(0);
    expect(queue.countPending()).toBe(0);
  });

  it("recovers all jobs from a dead browser", () => {
    const queue = createRenderQueue(db);

    queue.enqueue("source1");
    queue.enqueue("source2");

    queue.claim("browser-1");
    queue.claim("browser-1");

    expect(queue.countProcessing()).toBe(2);
    expect(queue.countPending()).toBe(0);

    const recovered = queue.recoverBrowser("browser-1");
    expect(recovered).toBe(2);

    expect(queue.countProcessing()).toBe(0);
    expect(queue.countPending()).toBe(2);
  });

  it("recovers stale jobs with expired lease", () => {
    // Use very short TTL for testing
    const queue = createRenderQueue(db, { leaseTtl: 1 });

    queue.enqueue("source");
    queue.claim("browser-1");

    expect(queue.countProcessing()).toBe(1);

    // Wait for lease to expire
    Bun.sleepSync(5);

    const recovered = queue.recoverStale();
    expect(recovered).toBe(1);

    expect(queue.countProcessing()).toBe(0);
    expect(queue.countPending()).toBe(1);
  });

  it("hasPending returns correct status", () => {
    const queue = createRenderQueue(db);

    expect(queue.hasPending()).toBe(false);

    queue.enqueue("source");
    expect(queue.hasPending()).toBe(true);

    queue.claim("browser-1");
    expect(queue.hasPending()).toBe(false);
  });

  it("counts pending and processing jobs correctly", () => {
    const queue = createRenderQueue(db);

    expect(queue.countPending()).toBe(0);
    expect(queue.countProcessing()).toBe(0);

    queue.enqueue("source1");
    queue.enqueue("source2");
    queue.enqueue("source3");

    expect(queue.countPending()).toBe(3);
    expect(queue.countProcessing()).toBe(0);

    queue.claim("browser-1");

    expect(queue.countPending()).toBe(2);
    expect(queue.countProcessing()).toBe(1);
  });
});
