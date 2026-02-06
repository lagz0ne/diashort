import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createTestScope, withTestScope } from "./helpers";
import { embedFlow, EmbedNotSupportedError } from "../flows/embed";
import { diagramStoreAtom } from "../atoms/diagram-store";
import { mermaidConfigTag, type MermaidConfig } from "../config/tags";
import { existsSync, unlinkSync } from "fs";

// Skip if Chrome not available
const CHROME_PATH = process.env.CHROME_PATH;
const describeWithChrome = CHROME_PATH ? describe : describe.skip;

// Test mermaid not configured - runs WITHOUT Chrome requirement
describe("embedFlow - mermaid not configured", () => {
  it("throws EmbedNotSupportedError when mermaid renderer is not available", async () => {
    // Don't provide mermaidConfigTag - renderer will be undefined
    await withTestScope({ tags: [] }, async (scope) => {
      const diagramStore = await scope.resolve(diagramStoreAtom);
      const shortlink = diagramStore.create("graph TD; A-->B", "mermaid");

      const ctx = scope.createContext({ tags: [] });
      try {
        await expect(
          ctx.exec({
            flow: embedFlow,
            input: { shortlink, versionName: "v1", theme: "light" },
          })
        ).rejects.toThrow("Mermaid SSR not configured");
      } finally {
        await ctx.close();
      }
    });
  });
});

describeWithChrome("embedFlow - mermaid", () => {
  const testDbPath = `/tmp/embed-test-${crypto.randomUUID()}.db`;

  afterAll(() => {
    if (existsSync(testDbPath)) unlinkSync(testDbPath);
  });

  it("renders mermaid diagram to SVG", async () => {
    const mermaidConfig: MermaidConfig = {
      executablePath: CHROME_PATH!,
      dbPath: testDbPath,
      poolSize: 1,
      noSandbox: true,
    };

    await withTestScope({ tags: [mermaidConfigTag(mermaidConfig)] }, async (scope) => {
      const diagramStore = await scope.resolve(diagramStoreAtom);
      const shortlink = diagramStore.create("graph TD; A-->B", "mermaid");

      const ctx = scope.createContext({ tags: [] });
      try {
        const result = await ctx.exec({
          flow: embedFlow,
          input: { shortlink, versionName: "v1", theme: "light" },
        });

        expect(result.svg).toContain("<svg");
        expect(result.svg).toContain("</svg>");
        expect(result.contentType).toBe("image/svg+xml");
      } finally {
        await ctx.close();
      }
    });
  }, 30000);

  it("rejects dangerous mermaid input with 400 status", async () => {
    const mermaidConfig: MermaidConfig = {
      executablePath: CHROME_PATH!,
      dbPath: testDbPath,
      poolSize: 1,
      noSandbox: true,
    };

    await withTestScope({ tags: [mermaidConfigTag(mermaidConfig)] }, async (scope) => {
      const diagramStore = await scope.resolve(diagramStoreAtom);
      const shortlink = diagramStore.create('click A "javascript:alert(1)"', "mermaid");

      const ctx = scope.createContext({ tags: [] });
      try {
        await ctx.exec({
          flow: embedFlow,
          input: { shortlink, versionName: "v1", theme: "light" },
        });
        expect.unreachable("Should have thrown");
      } catch (err) {
        expect((err as Error).message).toContain("forbidden");
        expect((err as { statusCode?: number }).statusCode).toBe(400);
      } finally {
        await ctx.close();
      }
    });
  }, 30000);
});
