import { describe, it, expect, mock } from "bun:test";
import { createScope, preset } from "@pumped-fn/lite";
import { terminalRendererAtom, type TerminalRendererResult } from "../atoms/terminal-renderer";
import { mockLoggerAtom } from "./helpers/mocks";
import { loggerAtom } from "../atoms/logger";
import { logLevelTag, nodeEnvTag, spawnFnTag, catimgPathTag, type SpawnFn } from "../config/tags";

describe("Terminal Renderer", () => {
  const createTestScope = (mockSpawn: any) => {
    return createScope({
      tags: [
        logLevelTag("error"),
        nodeEnvTag("test"),
        spawnFnTag(mockSpawn as unknown as SpawnFn),
        catimgPathTag("catimg"),
      ],
      presets: [preset(loggerAtom, mockLoggerAtom)],
    });
  };

  it("converts PNG bytes to terminal output via catimg", async () => {
    const mockOutput = "\x1b[38;2;255;0;0m█\x1b[0m"; // ANSI red block
    let capturedCmd: string[] = [];
    let capturedInputPath: string = "";

    const mockSpawn = mock((cmd: string[], _opts?: unknown) => {
      capturedCmd = cmd;
      capturedInputPath = cmd[cmd.length - 1] || "";

      return {
        exited: Promise.resolve(0),
        exitCode: 0,
        stdout: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(mockOutput));
            controller.close();
          }
        }),
        stderr: new ReadableStream({
          start(controller) { controller.close(); }
        }),
      };
    });

    const scope = createTestScope(mockSpawn);
    const terminalRenderer = await scope.resolve(terminalRendererAtom);

    const pngBytes = new Uint8Array([0x89, 0x50, 0x4E, 0x47]); // PNG magic bytes
    const result = await terminalRenderer.render(pngBytes);

    expect(capturedCmd[0]).toBe("catimg");
    expect(capturedInputPath).toContain(".png");
    expect(result.output).toBe(mockOutput);

    await scope.dispose();
  });

  it("passes width parameter to catimg", async () => {
    let capturedCmd: string[] = [];

    const mockSpawn = mock((cmd: string[], _opts?: unknown) => {
      capturedCmd = cmd;
      return {
        exited: Promise.resolve(0),
        exitCode: 0,
        stdout: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("output"));
            controller.close();
          }
        }),
        stderr: new ReadableStream({
          start(controller) { controller.close(); }
        }),
      };
    });

    const scope = createTestScope(mockSpawn);
    const terminalRenderer = await scope.resolve(terminalRendererAtom);

    const pngBytes = new Uint8Array([0x89, 0x50, 0x4E, 0x47]);
    await terminalRenderer.render(pngBytes, { width: 80 });

    expect(capturedCmd).toContain("-w");
    expect(capturedCmd).toContain("80");

    await scope.dispose();
  });

  it("throws CatimgError on non-zero exit code", async () => {
    const mockSpawn = mock(() => ({
      exited: Promise.resolve(1),
      exitCode: 1,
      stdout: new ReadableStream({
        start(controller) { controller.close(); }
      }),
      stderr: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("catimg: error"));
          controller.close();
        }
      }),
    }));

    const scope = createTestScope(mockSpawn);
    const terminalRenderer = await scope.resolve(terminalRendererAtom);

    const pngBytes = new Uint8Array([0x89, 0x50, 0x4E, 0x47]);

    await expect(terminalRenderer.render(pngBytes)).rejects.toThrow("catimg");

    await scope.dispose();
  });
});
