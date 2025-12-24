import { service, tags, type Lite } from "@pumped-fn/lite";
import { loggerAtom } from "./logger";
import { mermaidRendererAtom, MermaidRenderError } from "./mermaid-renderer";
import { spawnFnTag } from "../config/tags";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";

export class RenderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RenderError";
  }
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

export interface RendererService extends Lite.ServiceMethods {
  render: (
    ctx: Lite.ExecutionContext,
    source: string,
    format: "mermaid" | "d2",
    outputType: "svg" | "png"
  ) => Promise<Uint8Array>;
}

export const rendererService = service({
  deps: {
    logger: loggerAtom,
    spawn: tags.required(spawnFnTag),
    mermaidRenderer: mermaidRendererAtom,
  },
  factory: (_ctx, { logger, spawn, mermaidRenderer }): RendererService => ({
    render: async (
      _ctx: Lite.ExecutionContext,
      source: string,
      format: "mermaid" | "d2",
      outputType: "svg" | "png"
    ): Promise<Uint8Array> => {
      // Use browser pool for mermaid
      if (format === "mermaid") {
        try {
          return await mermaidRenderer.render(source, outputType);
        } catch (error) {
          if (error instanceof MermaidRenderError) {
            throw new RenderError(error.message);
          }
          throw error;
        }
      }

      // Keep subprocess approach for d2
      const id = randomUUID();
      const tempDir = tmpdir();

      const inputPath = join(tempDir, `diashort-${id}.d2`);
      const outputPath = join(tempDir, `diashort-${id}.${outputType}`);

      try {
        await Bun.write(inputPath, source);
        logger.debug({ inputPath, format }, "Created temp input file");

        // d2 input.d2 output.svg
        const cmd = ["d2", inputPath, outputPath];

        logger.debug({ cmd }, "Spawning renderer");

        let proc;
        try {
          proc = spawn(cmd, {
            stdout: "pipe",
            stderr: "pipe",
          });
        } catch (e: any) {
          // Handle spawn error (e.g. command not found)
          throw new RenderError(`Failed to spawn renderer: ${e.message}`);
        }

        const exitCode = await proc.exited;

        if (exitCode !== 0) {
          const stderr = await readStream(proc.stderr);
          logger.error({ exitCode, stderr }, "Renderer failed");
          throw new RenderError(`Renderer failed with exit code ${exitCode}: ${stderr}`);
        }

        logger.debug({ outputPath }, "Renderer finished, reading output");

        const output = Bun.file(outputPath);
        const exists = await output.exists();
        if (!exists) {
          throw new RenderError("Output file not generated");
        }

        const bytes = await output.bytes();
        return bytes;
      } catch (error) {
        logger.error({ error }, "Render error");
        if (error instanceof RenderError) throw error;
        throw new RenderError(error instanceof Error ? error.message : String(error));
      } finally {
        // Cleanup
        try {
          const inputExists = await Bun.file(inputPath).exists();
          if (inputExists) await Bun.file(inputPath).delete();

          const outputExists = await Bun.file(outputPath).exists();
          if (outputExists) await Bun.file(outputPath).delete();

          logger.debug({ inputPath, outputPath }, "Cleaned up temp files");
        } catch (cleanupError) {
          logger.warn({ cleanupError }, "Failed to cleanup temp files");
        }
      }
    },
  }),
});
