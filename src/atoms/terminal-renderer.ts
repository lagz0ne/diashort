import { atom, tags, type Lite } from "@pumped-fn/lite";
import { loggerAtom } from "./logger";
import { spawnFnTag, chafaPathTag } from "../config/tags";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";

export type TerminalOutputFormat = "symbols" | "sixels" | "kitty" | "iterm";

export interface TerminalRendererOptions {
  width?: number;
  format?: TerminalOutputFormat;
}

export class ChafaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChafaError";
  }
}

export interface TerminalRenderer extends Lite.ServiceMethods {
  render: (pngBytes: Uint8Array, options?: TerminalRendererOptions) => Promise<string>;
}

const readStream = async (stream: ReadableStream): Promise<string> => {
  const reader = stream.getReader();
  try {
    let result = "";
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      result += decoder.decode(value);
    }
    return result;
  } finally {
    reader.releaseLock();
  }
};

export const terminalRendererAtom = atom({
  deps: {
    logger: loggerAtom,
    spawn: tags.required(spawnFnTag),
    chafaPath: tags.required(chafaPathTag),
  },
  factory: (_ctx, { logger, spawn, chafaPath }): TerminalRenderer => ({
    render: async (pngBytes: Uint8Array, options?: TerminalRendererOptions): Promise<string> => {
      const id = randomUUID();
      const tempDir = tmpdir();
      const inputPath = join(tempDir, `diashort-chafa-${id}.png`);

      try {
        // Write PNG to temp file
        await Bun.write(inputPath, pngBytes);
        logger.debug({ inputPath }, "Wrote PNG to temp file for chafa");

        // Build chafa command
        // Default to symbols for maximum compatibility (server can't detect client terminal)
        const format = options?.format ?? "symbols";
        const width = options?.width ?? 80;

        const cmd: string[] = [chafaPath];
        cmd.push("-f", format);
        cmd.push("-s", `${width}x`);  // width in columns, auto height

        // For symbols mode, use full colors for best quality
        if (format === "symbols") {
          cmd.push("--colors", "full");
        }

        cmd.push(inputPath);

        logger.debug({ cmd, format, width }, "Spawning chafa");

        let proc;
        try {
          proc = spawn(cmd, {
            stdout: "pipe",
            stderr: "pipe",
          });
        } catch (e: any) {
          throw new ChafaError(`Failed to spawn chafa: ${e.message}`);
        }

        // Read both streams concurrently before checking exit
        const [stdout, stderr, exitCode] = await Promise.all([
          readStream(proc.stdout),
          readStream(proc.stderr),
          proc.exited,
        ]);

        if (exitCode !== 0) {
          logger.error({ exitCode, stderr }, "chafa failed");
          throw new ChafaError(`chafa failed with exit code ${exitCode}: ${stderr}`);
        }

        logger.debug({ outputLength: stdout.length, format }, "chafa finished");

        return stdout;
      } finally {
        // Cleanup temp file
        try {
          const exists = await Bun.file(inputPath).exists();
          if (exists) await Bun.file(inputPath).delete();
          logger.debug({ inputPath }, "Cleaned up chafa temp file");
        } catch (cleanupError) {
          logger.warn({ cleanupError }, "Failed to cleanup chafa temp file");
        }
      }
    },
  }),
});
