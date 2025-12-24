import { flow } from "@pumped-fn/lite";
import { cacheAtom } from "../atoms/cache";
import { loggerAtom } from "../atoms/logger";

export class NotFoundError extends Error {
  public readonly statusCode = 404;
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

export interface RetrieveInput {
  shortlink: string;
}

export interface RetrieveOutput {
  data: Uint8Array;
  contentType: string;
}

function parseRetrieveInput(input: unknown): RetrieveInput {
  if (!input || typeof input !== "object") {
    throw new NotFoundError("Invalid request");
  }

  const obj = input as Record<string, unknown>;

  if (typeof obj.shortlink !== "string" || obj.shortlink.trim() === "") {
    throw new NotFoundError("shortlink is required");
  }

  return { shortlink: obj.shortlink };
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export const retrieveFlow = flow({
  name: "retrieve",
  deps: {
    cache: cacheAtom,
    logger: loggerAtom,
  },
  parse: (raw: unknown) => parseRetrieveInput(raw),
  factory: async (ctx, { cache, logger }): Promise<RetrieveOutput> => {
    const { input } = ctx;

    logger.debug({ shortlink: input.shortlink }, "Retrieving from cache");

    const entry = cache.get(input.shortlink);

    if (!entry) {
      logger.debug({ shortlink: input.shortlink }, "Cache miss");
      throw new NotFoundError("Diagram not found or expired");
    }

    logger.debug({ shortlink: input.shortlink }, "Cache hit");

    return {
      data: base64ToUint8Array(entry.data),
      contentType: entry.contentType,
    };
  },
});
