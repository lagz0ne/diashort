import { flow } from "@pumped-fn/lite";
import { queueAtom } from "../atoms/queue";
import { rendererService } from "../atoms/renderer";
import { terminalRendererAtom } from "../atoms/terminal-renderer";
import { loggerAtom } from "../atoms/logger";
import { ValidationError } from "./render";

export type DiagramFormat = "mermaid" | "d2";

export interface TerminalRenderInput {
  source: string;
  format: DiagramFormat;
  width?: number;
}

export interface TerminalRenderResult {
  output: string;
}

function parseTerminalRenderInput(body: unknown): TerminalRenderInput {
  if (!body || typeof body !== "object") {
    throw new ValidationError("Request body must be a JSON object");
  }

  const obj = body as Record<string, unknown>;

  if (typeof obj.source !== "string" || obj.source.trim() === "") {
    throw new ValidationError("source is required and must be a non-empty string");
  }

  const format = obj.format;
  if (format !== "mermaid" && format !== "d2") {
    throw new ValidationError("format must be 'mermaid' or 'd2'");
  }

  let width: number | undefined;
  if (obj.width !== undefined) {
    if (typeof obj.width !== "number" || obj.width <= 0) {
      throw new ValidationError("width must be a positive number");
    }
    width = obj.width;
  }

  return {
    source: obj.source,
    format,
    width,
  };
}

export const renderTerminalFlow = flow({
  name: "render-terminal",
  deps: {
    queue: queueAtom,
    renderer: rendererService,
    terminalRenderer: terminalRendererAtom,
    logger: loggerAtom,
  },
  parse: parseTerminalRenderInput,
  factory: async (ctx, { queue, renderer, terminalRenderer, logger }): Promise<TerminalRenderResult> => {
    const { input } = ctx;

    logger.debug({ format: input.format, width: input.width }, "Starting terminal render");

    // Acquire queue slot for backpressure
    const release = await queue.acquire();
    ctx.onClose(() => release());

    // Render to PNG first
    const pngBytes = await ctx.exec({
      fn: renderer.render,
      params: [input.source, input.format, "png"],
      name: "renderer.render",
    });

    logger.debug({ pngSize: pngBytes.length }, "PNG rendered, converting to terminal output");

    // Convert PNG to terminal output via catimg
    const output = await terminalRenderer.render(pngBytes, { width: input.width });

    logger.info({ format: input.format, outputLength: output.length }, "Terminal render complete");

    return { output };
  },
});
