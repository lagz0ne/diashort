import { atom, tags, type Lite } from "@pumped-fn/lite";
import { loggerAtom } from "./logger";
import { spawnFnTag, catimgPathTag } from "../config/tags";
import { CatimgError } from "../errors/catimg-error";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";

export interface TerminalRendererOptions {
  width?: number;
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
    catimgPath: tags.required(catimgPathTag),
  },
  factory: (_ctx, { logger, spawn, catimgPath }): TerminalRenderer => ({
    render: async (pngBytes: Uint8Array, options?: TerminalRendererOptions): Promise<string> => {
      const id = randomUUID();
      const tempDir = tmpdir();
      const inputPath = join(tempDir, `diashort-catimg-${id}.png`);

      try {
        // Write PNG to temp file
        await Bun.write(inputPath, pngBytes);
        logger.debug({ inputPath }, "Wrote PNG to temp file for catimg");

        // Build catimg command - always specify width since catimg can't detect
        // terminal dimensions when running in a server/container environment
        const cmd: string[] = [catimgPath];
        const width = options?.width ?? 80;
        cmd.push("-w", String(width));
        cmd.push(inputPath);

        logger.debug({ cmd }, "Spawning catimg");

        let proc;
        try {
          proc = spawn(cmd, {
            stdout: "pipe",
            stderr: "pipe",
          });
        } catch (e: any) {
          throw new CatimgError(`Failed to spawn catimg: ${e.message}`);
        }

        // Read both streams concurrently before checking exit
        const [stdout, stderr, exitCode] = await Promise.all([
          readStream(proc.stdout),
          readStream(proc.stderr),
          proc.exited,
        ]);

        if (exitCode !== 0) {
          logger.error({ exitCode, stderr }, "catimg failed");
          throw new CatimgError(`catimg failed with exit code ${exitCode}: ${stderr}`);
        }

        logger.debug({ outputLength: stdout.length }, "catimg finished");

        return stdout;
      } finally {
        // Cleanup temp file
        try {
          const exists = await Bun.file(inputPath).exists();
          if (exists) await Bun.file(inputPath).delete();
          logger.debug({ inputPath }, "Cleaned up catimg temp file");
        } catch (cleanupError) {
          logger.warn({ cleanupError }, "Failed to cleanup catimg temp file");
        }
      }
    },
  }),
});
