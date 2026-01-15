// src/__tests__/diff-flow.test.ts
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createScope } from "@pumped-fn/lite";
import { createDiffFlow, viewDiffFlow, DiffValidationError, DiffNotFoundError } from "../flows/diff";
import { diagramConfigTag, baseUrlTag, requestOriginTag } from "../config/tags";
import { existsSync, unlinkSync } from "fs";

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
    it("returns HTML for existing diff", async () => {
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

      // View the diff
      const viewCtx = scope.createContext({ tags: [] });
      const result = await viewCtx.exec({
        flow: viewDiffFlow,
        rawInput: { shortlink: created.shortlink },
      });

      expect(result.html).toContain("<!DOCTYPE html>");
      expect(result.html).toContain("Before");
      expect(result.html).toContain("After");
      expect(result.contentType).toBe("text/html");

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
