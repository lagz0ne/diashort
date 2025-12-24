import { describe, it, expect, mock } from "bun:test";
import { createScope, atom, preset, type Lite } from "@pumped-fn/lite";
import { rendererService, RenderError } from "../atoms/renderer";
import { loggerAtom } from "../atoms/logger";
import { mermaidRendererAtom, type MermaidRenderer, MermaidRenderError } from "../atoms/mermaid-renderer";
import { mockLoggerAtom } from "./helpers/mocks";
import { logLevelTag, nodeEnvTag, spawnFnTag, type SpawnFn } from "../config/tags";

type MockSpawn = (cmd: string[], opts?: unknown) => {
  exited: Promise<number>;
  exitCode: number;
  stdout: ReadableStream;
  stderr: ReadableStream;
};

describe("Renderer Service (c3-103)", () => {
  const createTestScope = (
    mockSpawn: MockSpawn,
    mockMermaidRenderer?: MermaidRenderer
  ) => {
    const presetsArray: any[] = [preset(loggerAtom, mockLoggerAtom)];

    if (mockMermaidRenderer) {
      const mockMermaidAtom = atom({
        factory: () => mockMermaidRenderer,
      });
      presetsArray.push(preset(mermaidRendererAtom, mockMermaidAtom));
    }

    return createScope({
      tags: [
        logLevelTag("info"),
        nodeEnvTag("test"),
        spawnFnTag(mockSpawn as unknown as SpawnFn),
      ],
      presets: presetsArray,
    });
  };

  it("render(mermaid, source) uses mermaid renderer atom", async () => {
    let capturedSource: string = "";
    let capturedOutputType: "svg" | "png" = "svg";
    let renderCallCount = 0;

    const mockMermaidRenderer: MermaidRenderer = {
      render: async (source: string, outputType: "svg" | "png") => {
        renderCallCount++;
        capturedSource = source;
        capturedOutputType = outputType;
        return new TextEncoder().encode("mock-svg-content");
      },
    };

    const mockSpawn = mock(() => {
      throw new Error("spawn should not be called for mermaid");
    });

    const scope = createTestScope(mockSpawn, mockMermaidRenderer);
    const renderer = await scope.resolve(rendererService);
    const ctx = scope.createContext();

    const source = "graph TD; A-->B;";
    const result = await ctx.exec({
      fn: renderer.render,
      params: [source, "mermaid", "svg"],
    });
    await ctx.close();

    expect(renderCallCount).toBe(1);
    expect(capturedSource).toBe(source);
    expect(capturedOutputType).toBe("svg");
    expect(new TextDecoder().decode(result)).toBe("mock-svg-content");

    await scope.dispose();
  });

  it("render(d2, source) creates correct temp file and spawns d2", async () => {
    let capturedCmd: string[] = [];
    let capturedInputContent: string = "";

    const mockSpawn = mock((cmd: string[], _opts?: unknown) => {
      capturedCmd = cmd;

      const exitedPromise = (async () => {
        if (cmd.length >= 2) {
          const inputPath = cmd[1];
          if (inputPath) {
            capturedInputContent = await Bun.file(inputPath).text();
          }
        }
        if (cmd.length >= 3) {
          const outputPath = cmd[2];
          if (outputPath) {
            await Bun.write(outputPath, "mock-d2-svg");
          }
        }
        return 0;
      })();

      return {
        exited: exitedPromise,
        exitCode: 0,
        stdout: new ReadableStream({
             start(controller) { controller.close(); }
        }),
        stderr: new ReadableStream({
             start(controller) { controller.close(); }
        }),
      };
    });

    const scope = createTestScope(mockSpawn);
    const renderer = await scope.resolve(rendererService);
    const ctx = scope.createContext();

    const source = "x -> y";
    const result = await ctx.exec({
      fn: renderer.render,
      params: [source, "d2", "svg"],
    });
    await ctx.close();

    expect(capturedCmd[0]).toBe("d2");
    expect(capturedInputContent).toBe(source);
    expect(new TextDecoder().decode(result)).toBe("mock-d2-svg");

    await scope.dispose();
  });

  it("throws RenderError on mermaid syntax error", async () => {
    const mockMermaidRenderer: MermaidRenderer = {
      render: async () => {
        throw new MermaidRenderError("Mermaid syntax error");
      },
    };

    const mockSpawn = mock(() => {
      throw new Error("spawn should not be called");
    });

    const scope = createTestScope(mockSpawn, mockMermaidRenderer);
    const renderer = await scope.resolve(rendererService);
    const ctx = scope.createContext();

    expect(
      ctx.exec({ fn: renderer.render, params: ["bad", "mermaid", "svg"] })
    ).rejects.toThrow(RenderError);

    await ctx.close();
    await scope.dispose();
  });

  it("throws RenderError on d2 CLI not found (mock ENOENT)", async () => {
    const mockSpawn = mock(() => {
      throw new Error("No such file or directory");
    });

    const scope = createTestScope(mockSpawn);
    const renderer = await scope.resolve(rendererService);
    const ctx = scope.createContext();

    expect(
      ctx.exec({ fn: renderer.render, params: ["src", "d2", "svg"] })
    ).rejects.toThrow(RenderError);

    await ctx.close();
    await scope.dispose();
  });
});
