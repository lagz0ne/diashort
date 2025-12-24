import { flow } from "@pumped-fn/lite";
import { cacheAtom } from "../atoms/cache";
import { queueAtom, BackpressureError } from "../atoms/queue";
import { rendererService, RenderError } from "../atoms/renderer";
import { loggerAtom } from "../atoms/logger";
import { hashInput } from "../utils/hash";

export type DiagramFormat = "mermaid" | "d2";
export type OutputType = "svg" | "png";

export interface RenderInput {
  source: string;
  format: DiagramFormat;
  outputType: OutputType;
}

export interface SyncRenderResult {
  mode: "sync";
  shortlink: string;
  cached: boolean;
}

export class ValidationError extends Error {
  public readonly statusCode = 400;
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

function parseRenderInput(body: unknown): RenderInput {
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

  const outputType = obj.outputType ?? "svg";
  if (outputType !== "svg" && outputType !== "png") {
    throw new ValidationError("outputType must be 'svg' or 'png'");
  }

  return {
    source: obj.source,
    format,
    outputType,
  };
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function getContentType(outputType: OutputType): string {
  return outputType === "svg" ? "image/svg+xml" : "image/png";
}

export const renderFlow = flow({
  name: "render",
  deps: {
    cache: cacheAtom,
    queue: queueAtom,
    renderer: rendererService,
    logger: loggerAtom,
  },
  parse: (raw: unknown) => parseRenderInput(raw),
  factory: async (ctx, { cache, queue, renderer, logger }): Promise<SyncRenderResult> => {
    const { input } = ctx;

    // Check input cache first
    const inputHash = hashInput(input.source, input.format, input.outputType);
    const cachedShortlink = cache.getByInputHash(inputHash);

    if (cachedShortlink) {
      // Verify the output still exists
      const cachedOutput = cache.get(cachedShortlink);
      if (cachedOutput) {
        logger.info({ shortlink: cachedShortlink }, "Cache hit - returning existing shortlink");
        return { mode: "sync", shortlink: cachedShortlink, cached: true };
      }
    }

    logger.debug({ format: input.format, outputType: input.outputType }, "Starting render");

    const release = await queue.acquire();
    ctx.onClose(() => release());

    const bytes = await ctx.exec({
      fn: renderer.render,
      params: [input.source, input.format, input.outputType],
      name: "renderer.render",
    });

    const base64Data = uint8ArrayToBase64(bytes);
    const contentType = getContentType(input.outputType);
    const shortlink = cache.store(base64Data, contentType);
    cache.storeInputHash(inputHash, shortlink);

    logger.info({ shortlink, format: input.format }, "Render complete");

    return { mode: "sync", shortlink, cached: false };
  },
});

export { BackpressureError, RenderError };
