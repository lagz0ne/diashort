import { flow } from "@pumped-fn/lite";
import { queueAtom } from "../atoms/queue";
import { rendererService } from "../atoms/renderer";
import { terminalRendererAtom, type TerminalOutputFormat } from "../atoms/terminal-renderer";
import { loggerAtom } from "../atoms/logger";
import { ValidationError } from "./render";

export type DiagramFormat = "mermaid" | "d2";

export interface TerminalRenderInput {
  source: string;
  format: DiagramFormat;
  width?: number;
  scale?: number;
  output?: TerminalOutputFormat;
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

  let scale: number | undefined;
  if (obj.scale !== undefined) {
    if (typeof obj.scale !== "number" || obj.scale < 1 || obj.scale > 4) {
      throw new ValidationError("scale must be a number between 1 and 4");
    }
    scale = obj.scale;
  }

  let output: TerminalOutputFormat | undefined;
  if (obj.output !== undefined) {
    const validOutputs = ["symbols", "sixels", "kitty", "iterm"];
    if (typeof obj.output !== "string" || !validOutputs.includes(obj.output)) {
      throw new ValidationError("output must be one of: symbols, sixels, kitty, iterm");
    }
    output = obj.output as TerminalOutputFormat;
  }

  return {
    source: obj.source,
    format,
    width,
    scale,
    output,
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

    // Default scale to 2 for better terminal quality
    const scale = input.scale ?? 2;

    logger.debug({ format: input.format, width: input.width, scale }, "Starting terminal render");

    // Acquire queue slot for backpressure
    const release = await queue.acquire();
    ctx.onClose(() => release());

    // Render to PNG first with scale for higher resolution
    const pngBytes = await ctx.exec({
      fn: renderer.render,
      params: [input.source, input.format, "png", { scale }],
      name: "renderer.render",
    });

    logger.debug({ pngSize: pngBytes.length }, "PNG rendered, converting to terminal output");

    // Convert PNG to terminal output via chafa
    const terminalOutput = await terminalRenderer.render(pngBytes, {
      width: input.width,
      format: input.output,
    });

    logger.info({ format: input.format, outputFormat: input.output, outputLength: terminalOutput.length }, "Terminal render complete");

    return { output: terminalOutput };
  },
});
