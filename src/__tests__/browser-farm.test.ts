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
});
