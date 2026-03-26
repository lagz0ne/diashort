import { flow } from "@pumped-fn/lite";
import { diagramStoreAtom, ConflictError, type DiagramFormat } from "../atoms/diagram-store";
import { optionalD2RendererAtom } from "../atoms/d2-renderer";
import { optionalMermaidRendererAtom } from "../atoms/mermaid-renderer";
import { loggerAtom } from "../atoms/logger";
import { baseUrlTag, requestOriginTag } from "../config/tags";
import { NotFoundError } from "./view";

export interface CreateInput {
  source: string;
  format: DiagramFormat;
  shortlink?: string;
  version?: string;
}

export interface CreateResult {
  shortlink: string;
  url: string;
  embed: string;
  source: string;
  version: string;
}

export class ValidationError extends Error {
  public readonly statusCode = 400;
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

const VERSION_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]*$/;
const RESERVED_AUTO_PATTERN = /^v\d+$/;

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

  const result: CreateInput = {
    source: obj.source,
    format,
  };

  if (obj.version !== undefined && obj.shortlink === undefined) {
    throw new ValidationError("version requires shortlink");
  }

  if (obj.shortlink !== undefined) {
    if (typeof obj.shortlink !== "string" || obj.shortlink.trim() === "") {
      throw new ValidationError("shortlink must be a non-empty string");
    }
    result.shortlink = obj.shortlink;
  }

  if (obj.version !== undefined) {
    if (typeof obj.version !== "string" || obj.version.trim() === "") {
      throw new ValidationError("version must be a non-empty string");
    }
    if (!VERSION_NAME_PATTERN.test(obj.version)) {
      throw new ValidationError("version name must start with a letter and contain only letters, digits, hyphens, and underscores");
    }
    if (RESERVED_AUTO_PATTERN.test(obj.version)) {
      throw new ValidationError("version names matching 'vN' (e.g. v1, v2) are reserved for auto-naming");
    }
    result.version = obj.version;
  }

  return result;
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

    if (input.shortlink) {
      // Add version to existing diagram
      const existing = diagramStore.get(input.shortlink);
      if (!existing) {
        throw new NotFoundError("Diagram not found for the provided shortlink");
      }
      if (existing.format !== input.format) {
        throw new ValidationError(`Format mismatch: existing diagram uses '${existing.format}', but '${input.format}' was provided`);
      }

      logger.debug({ shortlink: input.shortlink, version: input.version }, "Adding version to existing diagram");

      const { versionName } = diagramStore.createVersion(input.shortlink, input.version ?? null, input.source);

      logger.info({ shortlink: input.shortlink, version: versionName }, "Version created");

      return {
        shortlink: input.shortlink,
        url: `${baseUrl}/d/${input.shortlink}/${versionName}`,
        embed: `${baseUrl}/e/${input.shortlink}/${versionName}`,
        source: `${baseUrl}/api/d/${input.shortlink}/versions/${versionName}/source`,
        version: versionName,
      };
    }

    // Create new diagram (gets v1 automatically)
    logger.debug({ format: input.format }, "Creating diagram");

    const shortlink = diagramStore.create(input.source, input.format);

    logger.info({ shortlink, format: input.format }, "Diagram created");

    return {
      shortlink,
      url: `${baseUrl}/d/${shortlink}`,
      embed: `${baseUrl}/e/${shortlink}`,
      source: `${baseUrl}/api/d/${shortlink}/versions/v1/source`,
      version: "v1",
    };
  },
});

export { ValidationError as CreateValidationError, ConflictError };
