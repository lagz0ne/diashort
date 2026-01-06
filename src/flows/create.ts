import { flow } from "@pumped-fn/lite";
import { diagramStoreAtom, type DiagramFormat } from "../atoms/diagram-store";
import { loggerAtom } from "../atoms/logger";
import { baseUrlTag, requestOriginTag } from "../config/tags";

export interface CreateInput {
  source: string;
  format: DiagramFormat;
}

export interface CreateResult {
  shortlink: string;
  url: string;
}

export class ValidationError extends Error {
  public readonly statusCode = 400;
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

function parseCreateInput(body: unknown): CreateInput {
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

  return {
    source: obj.source,
    format,
  };
}

export const createFlow = flow({
  name: "create",
  deps: {
    diagramStore: diagramStoreAtom,
    logger: loggerAtom,
  },
  parse: (raw: unknown) => parseCreateInput(raw),
  factory: async (ctx, { diagramStore, logger }): Promise<CreateResult> => {
    const { input } = ctx;
    // BASE_URL takes precedence if set, otherwise use request origin
    const configuredBaseUrl = ctx.data.seekTag(baseUrlTag);
    const requestOrigin = ctx.data.seekTag(requestOriginTag) ?? "";
    const baseUrl = configuredBaseUrl || requestOrigin;

    logger.debug({ format: input.format }, "Creating diagram");

    const shortlink = diagramStore.create(input.source, input.format);

    logger.info({ shortlink, format: input.format }, "Diagram created");

    return {
      shortlink,
      url: `${baseUrl}/d/${shortlink}`,
    };
  },
});

export { ValidationError as CreateValidationError };
