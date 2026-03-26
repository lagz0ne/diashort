// src/__tests__/diff-flow.test.ts
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { atom, createScope, preset } from "@pumped-fn/lite";
import { createDiffFlow, viewDiffFlow, DiffValidationError, DiffNotFoundError } from "../flows/diff";
import { optionalMermaidRendererAtom, type MermaidRenderer } from "../atoms/mermaid-renderer";
import { diagramConfigTag, baseUrlTag, requestOriginTag } from "../config/tags";
import { existsSync, unlinkSync } from "fs";

const mockMermaid: MermaidRenderer = {
  async render(source: string) {
    if (source.includes("INVALID")) throw new Error("Parse error: invalid syntax");
    return "<svg>mock</svg>";
  },
};

describe("Diff Flows", () => {
  const testDbPath = "/tmp/diff-flow-test.db";

  afterAll(() => {
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }
  });

  describe("createDiffFlow", () => {
    it("creates a mermaid diff and returns shortlink", async () => {
      const scope = createScope({
        tags: [
          diagramConfigTag({
            dbPath: testDbPath,
            retentionDays: 30,
            cleanupIntervalMs: 3600000,
          }),
          baseUrlTag("https://example.com"),
        ],
      });

      const ctx = scope.createContext({ tags: [requestOriginTag("https://test.com")] });

      const result = await ctx.exec({
        flow: createDiffFlow,
        rawInput: {
          format: "mermaid",
          before: "graph TD; A-->B;",
          after: "graph TD; A-->B-->C;",
        },
      });

      expect(result.shortlink).toMatch(/^[a-f0-9]{8}$/);
      expect(result.url).toBe(`https://example.com/diff/${result.shortlink}`);

      await ctx.close();
      await scope.dispose();
    });

    it("rejects invalid mermaid source in 'before' at create time", async () => {
      const scope = createScope({
        tags: [
          diagramConfigTag({ dbPath: testDbPath, retentionDays: 30, cleanupIntervalMs: 3600000 }),
          baseUrlTag("https://example.com"),
        ],
        presets: [
          preset(optionalMermaidRendererAtom, atom({ factory: (): MermaidRenderer | undefined => mockMermaid })),
        ],
      });

      const ctx = scope.createContext({ tags: [requestOriginTag("https://test.com")] });

      try {
        await ctx.exec({
          flow: createDiffFlow,
          rawInput: {
            format: "mermaid",
            before: "INVALID mermaid garbage",
            after: "graph TD; A-->B;",
          },
        });
        expect.unreachable("should have thrown");
      } catch (err) {
        const error = err as Error & { cause?: Error };
        const actual = error.cause ?? error;
        expect(actual).toBeInstanceOf(DiffValidationError);
        expect(actual.message).toContain("before");
      }

      await ctx.close();
      await scope.dispose();
    });

    it("rejects invalid mermaid source in 'after' at create time", async () => {
      const scope = createScope({
        tags: [
          diagramConfigTag({ dbPath: testDbPath, retentionDays: 30, cleanupIntervalMs: 3600000 }),
          baseUrlTag("https://example.com"),
        ],
        presets: [
          preset(optionalMermaidRendererAtom, atom({ factory: (): MermaidRenderer | undefined => mockMermaid })),
        ],
      });

      const ctx = scope.createContext({ tags: [requestOriginTag("https://test.com")] });

      try {
        await ctx.exec({
          flow: createDiffFlow,
          rawInput: {
            format: "mermaid",
            before: "graph TD; A-->B;",
            after: "INVALID mermaid garbage",
          },
        });
        expect.unreachable("should have thrown");
      } catch (err) {
        const error = err as Error & { cause?: Error };
        const actual = error.cause ?? error;
        expect(actual).toBeInstanceOf(DiffValidationError);
        expect(actual.message).toContain("after");
      }

      await ctx.close();
      await scope.dispose();
    });

    it("throws validation error for missing before", async () => {
      const scope = createScope({
        tags: [
          diagramConfigTag({
            dbPath: testDbPath,
            retentionDays: 30,
            cleanupIntervalMs: 3600000,
          }),
        ],
      });

      const ctx = scope.createContext({ tags: [requestOriginTag("https://test.com")] });

      try {
        await ctx.exec({
          flow: createDiffFlow,
          rawInput: {
            format: "mermaid",
            after: "graph TD; A-->B;",
          },
        });
        expect(true).toBe(false); // Should not reach
      } catch (err) {
        // The flow framework wraps parse errors, check the cause
        const error = err as Error & { cause?: Error };
        const message = error.cause?.message ?? error.message;
        expect(message).toContain("before");
      }

      await ctx.close();
      await scope.dispose();
    });
  });

  describe("viewDiffFlow", () => {
    it("throws 503 for mermaid diff without CHROME_PATH", async () => {
      // Mermaid diffs require server-side rendering via CHROME_PATH
      if (process.env.CHROME_PATH) return;

      const scope = createScope({
        tags: [
          diagramConfigTag({
            dbPath: testDbPath,
            retentionDays: 30,
            cleanupIntervalMs: 3600000,
          }),
          baseUrlTag("https://example.com"),
        ],
      });

      // Create a diff first
      const createCtx = scope.createContext({ tags: [requestOriginTag("https://test.com")] });
      const created = await createCtx.exec({
        flow: createDiffFlow,
        rawInput: {
          format: "mermaid",
          before: "graph TD; X-->Y;",
          after: "graph TD; X-->Y-->Z;",
        },
      });
      await createCtx.close();

      // View the diff — should throw because no mermaid renderer
      const viewCtx = scope.createContext({ tags: [] });
      await expect(
        viewCtx.exec({
          flow: viewDiffFlow,
          rawInput: { shortlink: created.shortlink },
        })
      ).rejects.toThrow("Mermaid SSR not configured");

      await viewCtx.close();
      await scope.dispose();
    });

    it("throws not found for non-existent diff", async () => {
      const scope = createScope({
        tags: [
          diagramConfigTag({
            dbPath: testDbPath,
            retentionDays: 30,
            cleanupIntervalMs: 3600000,
          }),
        ],
      });

      const ctx = scope.createContext({ tags: [] });

      try {
        await ctx.exec({
          flow: viewDiffFlow,
          rawInput: { shortlink: "nonexist" },
        });
        expect(true).toBe(false);
      } catch (err) {
        // The flow framework wraps parse errors, check the cause
        const error = err as Error & { cause?: Error };
        const actualError = error.cause ?? error;
        expect(actualError).toBeInstanceOf(DiffNotFoundError);
      }

      await ctx.close();
      await scope.dispose();
    });
  });
});
