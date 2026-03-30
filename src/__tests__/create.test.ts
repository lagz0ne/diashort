import { describe, it, expect } from "bun:test";
import { atom, preset } from "@pumped-fn/lite";
import { withTestScope } from "./helpers";
import { createFlow, ValidationError } from "../flows/create";
import { optionalD2RendererAtom, type D2Renderer } from "../atoms/d2-renderer";
import { optionalMermaidRendererAtom, type MermaidRenderer } from "../atoms/mermaid-renderer";
import { baseUrlTag, requestOriginTag } from "../config/tags";

// Mock renderers: succeed for valid sources, fail for sources containing "INVALID"
const mockD2Renderer: D2Renderer = {
  async render(source: string, _theme: "light" | "dark") {
    if (source.includes("INVALID")) {
      throw new Error("D2 render failed: syntax error near line 1");
    }
    return "<svg>mock-d2</svg>";
  },
};

const mockMermaidRenderer: MermaidRenderer = {
  async render(source: string) {
    if (source.includes("INVALID")) {
      throw new Error("Parse error on line 1: invalid syntax");
    }
    return "<svg>mock-mermaid</svg>";
  },
};

const rendererPresets = [
  preset(optionalD2RendererAtom, atom({ factory: (): D2Renderer | undefined => mockD2Renderer })),
  preset(optionalMermaidRendererAtom, atom({ factory: (): MermaidRenderer | undefined => mockMermaidRenderer })),
];

describe("createFlow", () => {
  it("returns embed URL for mermaid diagrams", async () => {
    await withTestScope({ tags: [baseUrlTag("https://example.com")], presets: rendererPresets }, async (scope) => {
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
    await withTestScope({ tags: [baseUrlTag("https://example.com")], presets: rendererPresets }, async (scope) => {
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

  it("rejects invalid D2 source at create time", async () => {
    await withTestScope({ tags: [baseUrlTag("https://example.com")], presets: rendererPresets }, async (scope) => {
      const ctx = scope.createContext({ tags: [requestOriginTag("https://example.com")] });
      try {
        await ctx.exec({
          flow: createFlow,
          rawInput: { source: "INVALID d2 garbage {{{}}", format: "d2" },
        });
        expect.unreachable("should have thrown");
      } catch (err) {
        const error = err as Error & { cause?: Error };
        const actual = error.cause ?? error;
        expect(actual).toBeInstanceOf(ValidationError);
        expect(actual.message).toContain("D2");
      } finally {
        await ctx.close();
      }
    });
  });

  it("rejects invalid mermaid source at create time", async () => {
    await withTestScope({ tags: [baseUrlTag("https://example.com")], presets: rendererPresets }, async (scope) => {
      const ctx = scope.createContext({ tags: [requestOriginTag("https://example.com")] });
      try {
        await ctx.exec({
          flow: createFlow,
          rawInput: { source: "INVALID mermaid garbage", format: "mermaid" },
        });
        expect.unreachable("should have thrown");
      } catch (err) {
        const error = err as Error & { cause?: Error };
        const actual = error.cause ?? error;
        expect(actual).toBeInstanceOf(ValidationError);
        expect(actual.message).toContain("mermaid");
      } finally {
        await ctx.close();
      }
    });
  });

  it("skips mermaid validation when SSR not configured", async () => {
    // Provide only D2 renderer, no mermaid
    const noMermaidPresets = [
      preset(optionalD2RendererAtom, atom({ factory: (): D2Renderer | undefined => mockD2Renderer })),
      preset(optionalMermaidRendererAtom, atom({ factory: (): MermaidRenderer | undefined => undefined })),
    ];

    await withTestScope({ tags: [baseUrlTag("https://example.com")], presets: noMermaidPresets }, async (scope) => {
      const ctx = scope.createContext({ tags: [requestOriginTag("https://example.com")] });
      try {
        // Even with potentially invalid source, should succeed since we can't validate
        const result = await ctx.exec({
          flow: createFlow,
          rawInput: { source: "anything goes here", format: "mermaid" },
        });

        expect(result.shortlink).toBeDefined();
      } finally {
        await ctx.close();
      }
    });
  });
});
