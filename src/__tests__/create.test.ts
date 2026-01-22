import { describe, it, expect } from "bun:test";
import { withTestScope } from "./helpers";
import { createFlow } from "../flows/create";
import { baseUrlTag, requestOriginTag } from "../config/tags";

describe("createFlow", () => {
  it("returns embed URL for mermaid diagrams", async () => {
    await withTestScope({ tags: [baseUrlTag("https://example.com")] }, async (scope) => {
      const ctx = scope.createContext({ tags: [requestOriginTag("https://example.com")] });
      try {
        const result = await ctx.exec({
          flow: createFlow,
          rawInput: { source: "graph TD; A-->B", format: "mermaid" },
        });

        expect(result.shortlink).toBeDefined();
        expect(result.url).toContain("/d/");
        expect(result.embed).toContain("/e/");
      } finally {
        await ctx.close();
      }
    });
  });

  it("returns embed URL for d2 diagrams", async () => {
    await withTestScope({ tags: [baseUrlTag("https://example.com")] }, async (scope) => {
      const ctx = scope.createContext({ tags: [requestOriginTag("https://example.com")] });
      try {
        const result = await ctx.exec({
          flow: createFlow,
          rawInput: { source: "A -> B", format: "d2" },
        });

        expect(result.embed).toContain("/e/");
      } finally {
        await ctx.close();
      }
    });
  });
});
