import { flow } from "@pumped-fn/lite";
import { cacheAtom } from "../atoms/cache";
import { jobStoreAtom } from "../atoms/job-store";
import { loggerAtom } from "../atoms/logger";
import { hashInput } from "../utils/hash";
import { ValidationError, type SyncRenderResult } from "./render";
import { baseUrlTag } from "../config/tags";

export interface AsyncRenderInput {
  source: string;
  format: "mermaid" | "d2";
  outputType: "svg" | "png";
}

export interface AsyncRenderResult {
  mode: "async";
  jobId: string;
  status: "pending";
  statusUrl: string;
}

export type RenderResult = SyncRenderResult | AsyncRenderResult;

function parseAsyncRenderInput(body: unknown): AsyncRenderInput {
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

export const asyncRenderFlow = flow({
  name: "render-async",
  deps: {
    cache: cacheAtom,
    jobStore: jobStoreAtom,
    logger: loggerAtom,
  },
  parse: parseAsyncRenderInput,
  factory: async (ctx, { cache, jobStore, logger }): Promise<RenderResult> => {
    const { input } = ctx;
    const baseUrl = ctx.data.seekTag(baseUrlTag) ?? "";

    // Check input cache first
    const inputHash = hashInput(input.source, input.format, input.outputType);
    const cachedShortlink = cache.getByInputHash(inputHash);

    if (cachedShortlink) {
      const cachedOutput = cache.get(cachedShortlink);
      if (cachedOutput) {
        logger.info({ shortlink: cachedShortlink }, "Cache hit - returning existing shortlink");
        return { mode: "sync", shortlink: cachedShortlink, cached: true };
      }
    }

    // Create job for background processing
    const jobId = jobStore.create({
      source: input.source,
      format: input.format,
      outputType: input.outputType,
    });

    logger.info({ jobId }, "Created async render job");

    return {
      mode: "async",
      jobId,
      status: "pending",
      statusUrl: `${baseUrl}/jobs/${jobId}`,
    };
  },
});
