import { flow } from "@pumped-fn/lite";
import { diagramStoreAtom, type DiagramFormat } from "../atoms/diagram-store";
import { optionalD2RendererAtom } from "../atoms/d2-renderer";
import { optionalMermaidRendererAtom } from "../atoms/mermaid-renderer";
import { loggerAtom } from "../atoms/logger";
import { baseUrlTag, requestOriginTag } from "../config/tags";

export interface CreateInput {
  source: string;
  format: DiagramFormat;
}

export interface CreateResult {
  shortlink: string;
  url: string;
  embed: string;
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

  return { source: obj.source, format };
}

export const createFlow = flow({
  name: "create",
  deps: {
    diagramStore: diagramStoreAtom,
    d2Renderer: optionalD2RendererAtom,
    mermaidRenderer: optionalMermaidRendererAtom,
    logger: loggerAtom,
  },
  parse: (raw: unknown) => parseCreateInput(raw),
  factory: async (ctx, { diagramStore, d2Renderer, mermaidRenderer, logger }): Promise<CreateResult> => {
    const { input } = ctx;
    const configuredBaseUrl = ctx.data.seekTag(baseUrlTag);
    const requestOrigin = ctx.data.seekTag(requestOriginTag) ?? "";
    const baseUrl = configuredBaseUrl || requestOrigin;

    // Best-effort: skip validation if renderer unavailable
    if (input.format === "d2" && d2Renderer) {
      try {
        await d2Renderer.render(input.source, "light");
      } catch (err) {
        throw new ValidationError(`Invalid D2 source: ${(err as Error).message}`);
      }
    } else if (input.format === "mermaid" && mermaidRenderer) {
      try {
        await mermaidRenderer.render(input.source);
      } catch (err) {
        throw new ValidationError(`Invalid mermaid source: ${(err as Error).message}`);
      }
    }

    logger.debug({ format: input.format }, "Creating diagram");

    const shortlink = diagramStore.create(input.source, input.format);

    logger.info({ shortlink, format: input.format }, "Diagram created");

    return {
      shortlink,
      url: `${baseUrl}/d/${shortlink}`,
      embed: `${baseUrl}/e/${shortlink}`,
    };
  },
});

export { ValidationError as CreateValidationError };
