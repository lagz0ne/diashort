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

export interface TerminalRendererResult {
  output: string;
}

export interface TerminalRenderer extends Lite.ServiceMethods {
  render: (pngBytes: Uint8Array, options?: TerminalRendererOptions) => Promise<TerminalRendererResult>;
}

const readStream = async (stream: ReadableStream): Promise<string> => {
  const reader = stream.getReader();
  let result = "";
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result += decoder.decode(value);
  }
  return result;
};

export const terminalRendererAtom = atom({
  deps: {
    logger: loggerAtom,
    spawn: tags.required(spawnFnTag),
    catimgPath: tags.required(catimgPathTag),
  },
  factory: (_ctx, { logger, spawn, catimgPath }): TerminalRenderer => ({
    render: async (pngBytes: Uint8Array, options?: TerminalRendererOptions): Promise<TerminalRendererResult> => {
      const id = randomUUID();
      const tempDir = tmpdir();
      const inputPath = join(tempDir, `diashort-catimg-${id}.png`);

      try {
        // Write PNG to temp file
        await Bun.write(inputPath, pngBytes);
        logger.debug({ inputPath }, "Wrote PNG to temp file for catimg");

        // Build catimg command
        const cmd: string[] = [catimgPath];
        if (options?.width) {
          cmd.push("-w", String(options.width));
        }
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

        const exitCode = await proc.exited;

        if (exitCode !== 0) {
          const stderr = await readStream(proc.stderr);
          logger.error({ exitCode, stderr }, "catimg failed");
          throw new CatimgError(`catimg failed with exit code ${exitCode}: ${stderr}`);
        }

        const output = await readStream(proc.stdout);
        logger.debug({ outputLength: output.length }, "catimg finished");

        return { output };
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
