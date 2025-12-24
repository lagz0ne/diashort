import { describe, it, expect } from "bun:test";
import { createScope, preset, atom } from "@pumped-fn/lite";
import { renderTerminalFlow } from "../flows/render-terminal";
import { mockLoggerAtom } from "./helpers/mocks";
import { loggerAtom } from "../atoms/logger";
import { rendererService, type RendererService } from "../atoms/renderer";
import { terminalRendererAtom, type TerminalRenderer } from "../atoms/terminal-renderer";
import { queueAtom } from "../atoms/queue";
import { logLevelTag, nodeEnvTag, queueConfigTag } from "../config/tags";

describe("render-terminal-flow", () => {
  const createTestScope = (
    mockRenderer: Partial<RendererService>,
    mockTerminalRenderer: Partial<TerminalRenderer>
  ) => {
    const mockRendererAtom = atom({
      factory: () => mockRenderer as RendererService,
    });

    const mockTerminalRendererAtom = atom({
      factory: () => mockTerminalRenderer as TerminalRenderer,
    });

    return createScope({
      tags: [
        logLevelTag("error"),
        nodeEnvTag("test"),
        queueConfigTag({ maxConcurrent: 10, maxWaiting: 50 }),
      ],
      presets: [
        preset(loggerAtom, mockLoggerAtom),
        preset(rendererService, mockRendererAtom),
        preset(terminalRendererAtom, mockTerminalRendererAtom),
      ],
    });
  };

  it("renders mermaid to terminal output", async () => {
    const mockPng = new Uint8Array([0x89, 0x50, 0x4E, 0x47]);
    const mockTerminalOutput = "\x1b[38;2;255;0;0m█\x1b[0m";

    const mockRenderer = {
      render: async () => mockPng,
    };

    const mockTerminalRenderer = {
      render: async () => mockTerminalOutput,
    };

    const scope = createTestScope(mockRenderer, mockTerminalRenderer);
    const ctx = scope.createContext();

    const result = await ctx.exec({
      flow: renderTerminalFlow,
      rawInput: {
        source: "graph TD; A-->B;",
        format: "mermaid",
      },
    });

    expect(result.output).toBe(mockTerminalOutput);

    await ctx.close();
    await scope.dispose();
  });

  it("passes width option to terminal renderer", async () => {
    let capturedWidth: number | undefined;

    const mockRenderer = {
      render: async () => new Uint8Array([0x89, 0x50, 0x4E, 0x47]),
    };

    const mockTerminalRenderer = {
      render: async (_bytes: Uint8Array, options?: { width?: number }) => {
        capturedWidth = options?.width;
        return "output";
      },
    };

    const scope = createTestScope(mockRenderer, mockTerminalRenderer);
    const ctx = scope.createContext();

    await ctx.exec({
      flow: renderTerminalFlow,
      rawInput: {
        source: "graph TD; A-->B;",
        format: "mermaid",
        width: 120,
      },
    });

    expect(capturedWidth).toBe(120);

    await ctx.close();
    await scope.dispose();
  });

  it("throws ValidationError for invalid format", async () => {
    const scope = createTestScope({}, {});
    const ctx = scope.createContext();

    await expect(
      ctx.exec({
        flow: renderTerminalFlow,
        rawInput: {
          source: "test",
          format: "invalid",
        },
      })
    ).rejects.toThrow();

    await ctx.close();
    await scope.dispose();
  });
});
