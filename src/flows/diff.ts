import { flow } from "@pumped-fn/lite";
import { diffStoreAtom, type CreateDiffInput } from "../atoms/diff-store";
import { diffViewerAtom } from "../atoms/diff-viewer";
import { d2RendererAtom } from "../atoms/d2-renderer";
import { loggerAtom } from "../atoms/logger";
import { baseUrlTag, requestOriginTag } from "../config/tags";
import type { DiagramFormat } from "../atoms/diagram-store";

export class DiffValidationError extends Error {
  public readonly statusCode = 400;
  constructor(message: string) {
    super(message);
    this.name = "DiffValidationError";
  }
}

export class DiffNotFoundError extends Error {
  public readonly statusCode = 404;
  constructor(message: string) {
    super(message);
    this.name = "DiffNotFoundError";
  }
}

interface CreateDiffRawInput {
  format?: unknown;
  before?: unknown;
  after?: unknown;
}

export interface CreateDiffResult {
  shortlink: string;
  url: string;
}

function parseCreateDiffInput(body: unknown): CreateDiffInput {
  if (!body || typeof body !== "object") {
    throw new DiffValidationError("Request body must be a JSON object");
  }

  const obj = body as CreateDiffRawInput;

  const format = obj.format;
  if (format !== "mermaid" && format !== "d2") {
    throw new DiffValidationError("format must be 'mermaid' or 'd2'");
  }

  if (typeof obj.before !== "string" || obj.before.trim() === "") {
    throw new DiffValidationError("before is required and must be a non-empty string");
  }

  if (typeof obj.after !== "string" || obj.after.trim() === "") {
    throw new DiffValidationError("after is required and must be a non-empty string");
  }

  return {
    format: format as DiagramFormat,
    before: obj.before,
    after: obj.after,
  };
}

export const createDiffFlow = flow({
  name: "createDiff",
  deps: {
    diffStore: diffStoreAtom,
    d2Renderer: d2RendererAtom,
    logger: loggerAtom,
  },
  parse: (raw: unknown) => parseCreateDiffInput(raw),
  factory: async (ctx, { diffStore, d2Renderer, logger }): Promise<CreateDiffResult> => {
    const { input } = ctx;
    const configuredBaseUrl = ctx.data.seekTag(baseUrlTag);
    const requestOrigin = ctx.data.seekTag(requestOriginTag) ?? "";
    const baseUrl = configuredBaseUrl || requestOrigin;

    logger.debug({ format: input.format }, "Creating diff");

    // Validate D2 syntax for both before and after
    if (input.format === "d2") {
      try {
        await d2Renderer.render(input.before, "light");
      } catch (err) {
        throw new DiffValidationError(`Invalid D2 syntax in 'before': ${(err as Error).message}`);
      }
      try {
        await d2Renderer.render(input.after, "light");
      } catch (err) {
        throw new DiffValidationError(`Invalid D2 syntax in 'after': ${(err as Error).message}`);
      }
    }

    const shortlink = diffStore.create(input);

    logger.info({ shortlink, format: input.format }, "Diff created");

    return {
      shortlink,
      url: `${baseUrl}/diff/${shortlink}`,
    };
  },
});

export interface ViewDiffInput {
  shortlink: string;
}

export interface ViewDiffResult {
  html: string;
  contentType: string;
}

function parseViewDiffInput(input: unknown): ViewDiffInput {
  if (!input || typeof input !== "object") {
    throw new DiffNotFoundError("Invalid request");
  }

  const obj = input as Record<string, unknown>;

  if (typeof obj.shortlink !== "string" || obj.shortlink.trim() === "") {
    throw new DiffNotFoundError("shortlink is required");
  }

  return { shortlink: obj.shortlink };
}

export const viewDiffFlow = flow({
  name: "viewDiff",
  deps: {
    diffStore: diffStoreAtom,
    diffViewer: diffViewerAtom,
    d2Renderer: d2RendererAtom,
    logger: loggerAtom,
  },
  parse: (raw: unknown) => parseViewDiffInput(raw),
  factory: async (ctx, { diffStore, diffViewer, d2Renderer, logger }): Promise<ViewDiffResult> => {
    const { shortlink } = ctx.input;

    logger.debug({ shortlink }, "Viewing diff");

    const diff = diffStore.get(shortlink);
    if (!diff) {
      throw new DiffNotFoundError("Diff not found");
    }

    diffStore.touch(shortlink);

    let html: string;

    if (diff.format === "mermaid") {
      html = diffViewer.generateMermaidDiff({
        before: diff.before,
        after: diff.after,
        shortlink,
      });
    } else {
      // D2: pre-render all 4 variants (before/after x light/dark)
      const [beforeLight, beforeDark, afterLight, afterDark] = await Promise.all([
        d2Renderer.render(diff.before, "light"),
        d2Renderer.render(diff.before, "dark"),
        d2Renderer.render(diff.after, "light"),
        d2Renderer.render(diff.after, "dark"),
      ]);

      html = diffViewer.generateD2Diff({
        beforeLightSvg: beforeLight,
        beforeDarkSvg: beforeDark,
        afterLightSvg: afterLight,
        afterDarkSvg: afterDark,
        shortlink,
      });
    }

    logger.info({ shortlink, format: diff.format }, "Diff viewed");

    return {
      html,
      contentType: "text/html",
    };
  },
});
