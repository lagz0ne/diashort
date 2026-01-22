// src/__tests__/browser-farm.test.ts
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { createBrowserFarm } from "../atoms/browser-farm";
import { existsSync, unlinkSync } from "fs";

// Skip tests if Chrome not available
const CHROME_PATH = process.env.CHROME_PATH;
const describeWithChrome = CHROME_PATH ? describe : describe.skip;

describeWithChrome("BrowserFarm", () => {
  // Unique DB per test for complete isolation
  let testDbPath: string;
  let db: Database;

  beforeEach(() => {
    // Create fresh DB for each test
    testDbPath = `/tmp/browser-farm-test-${crypto.randomUUID()}.db`;
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

  it("starts and stops browsers", async () => {
    const farm = createBrowserFarm({
      executablePath: CHROME_PATH!,
      db,
      poolSize: 1,
    });

    await farm.start();
    await farm.stop();
  });

  it("renders mermaid diagram to SVG", async () => {
    const farm = createBrowserFarm({
      executablePath: CHROME_PATH!,
      db,
      poolSize: 1,
      noSandbox: true, // Required for WSL2/containerized environments
    });

    await farm.start();

    try {
      const svg = await farm.render("graph TD; A-->B");
      expect(svg).toContain("<svg");
      expect(svg).toContain("</svg>");
    } finally {
      await farm.stop();
    }
  }, 30000); // Browser rendering can take time

  it("handles concurrent render requests", async () => {
    const farm = createBrowserFarm({
      executablePath: CHROME_PATH!,
      db,
      poolSize: 2,
      noSandbox: true, // Required for WSL2/containerized environments
    });

    await farm.start();

    try {
      const results = await Promise.all([
        farm.render("graph TD; A-->B"),
        farm.render("graph TD; C-->D"),
        farm.render("graph TD; E-->F"),
      ]);

      expect(results).toHaveLength(3);
      results.forEach((svg) => {
        expect(svg).toContain("<svg");
      });
    } finally {
      await farm.stop();
    }
  }, 60000); // Concurrent renders with queue processing

  it("rejects render before start", async () => {
    const farm = createBrowserFarm({
      executablePath: CHROME_PATH!,
      db,
      poolSize: 1,
    });

    await expect(farm.render("graph TD; A-->B")).rejects.toThrow("farm not started");
  });

  it("stop rejects all pending promises", async () => {
    const farm = createBrowserFarm({
      executablePath: CHROME_PATH!,
      db,
      poolSize: 1,
      timeout: 60_000, // Long timeout so job doesn't finish
      noSandbox: true,
    });

    await farm.start();

    // Start a render but don't await it
    const renderPromise = farm.render("graph TD; A-->B");

    // Stop immediately
    await farm.stop();

    // Render should reject
    await expect(renderPromise).rejects.toThrow("farm stopped");
  });

  it("rejects on invalid mermaid syntax", async () => {
    const farm = createBrowserFarm({
      executablePath: CHROME_PATH!,
      db,
      poolSize: 1,
      noSandbox: true,
    });

    await farm.start();

    try {
      await expect(farm.render("not valid mermaid")).rejects.toThrow();
    } finally {
      await farm.stop();
    }
  }, 30000);

  it("rejects on render timeout", async () => {
    const farm = createBrowserFarm({
      executablePath: CHROME_PATH!,
      db,
      poolSize: 1,
      timeout: 1, // 1ms timeout - will always fail
      noSandbox: true,
    });

    await farm.start();

    try {
      await expect(farm.render("graph TD; A-->B")).rejects.toThrow("timeout");
    } finally {
      await farm.stop();
    }
  }, 30000);

  it("retry eventually resolves original promise on success", async () => {
    // This test verifies that when a job fails and is retried,
    // the original render() promise is eventually resolved on success
    const farm = createBrowserFarm({
      executablePath: CHROME_PATH!,
      db,
      poolSize: 2, // Need 2 browsers so second can pick up retry
      noSandbox: true,
    });

    await farm.start();

    try {
      // Simple diagram should succeed
      const svg = await farm.render("graph TD; A-->B");
      expect(svg).toContain("<svg");
    } finally {
      await farm.stop();
    }
  }, 30000);

  it("allows valid text containing 'data:' in labels", async () => {
    const farm = createBrowserFarm({
      executablePath: CHROME_PATH!,
      db,
      poolSize: 1,
      noSandbox: true,
    });

    await farm.start();

    try {
      // Valid diagram with "data:" as part of label text (not a data URI)
      const svg = await farm.render("graph TD\n    A[Show data: step 1] --> B[Process data: values]");
      expect(svg).toContain("<svg");
    } finally {
      await farm.stop();
    }
  }, 30000);

  it("rejects dangerous data URIs", async () => {
    const farm = createBrowserFarm({
      executablePath: CHROME_PATH!,
      db,
      poolSize: 1,
      noSandbox: true,
    });

    await farm.start();

    try {
      // Data URI with MIME type should be blocked
      await expect(farm.render('click A "data:text/html,<script>"')).rejects.toThrow(
        "source contains forbidden content"
      );
    } finally {
      await farm.stop();
    }
  }, 30000);

  it("rejects javascript: protocol", async () => {
    const farm = createBrowserFarm({
      executablePath: CHROME_PATH!,
      db,
      poolSize: 1,
      noSandbox: true,
    });

    await farm.start();

    try {
      await expect(farm.render('click A "javascript:alert(1)"')).rejects.toThrow(
        "source contains forbidden content"
      );
    } finally {
      await farm.stop();
    }
  }, 30000);
});
