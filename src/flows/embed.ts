import { flow } from "@pumped-fn/lite";
import { diagramStoreAtom } from "../atoms/diagram-store";
import { d2RendererAtom } from "../atoms/d2-renderer";
import { optionalMermaidRendererAtom } from "../atoms/mermaid-renderer";
import { loggerAtom } from "../atoms/logger";
import { NotFoundError } from "./view";

export interface EmbedInput {
  shortlink: string;
  theme?: "light" | "dark";
}

export interface EmbedOutput {
  svg: string;
  contentType: "image/svg+xml";
}

export class EmbedNotSupportedError extends Error {
  public readonly statusCode = 404;
  constructor(message: string) {
    super(message);
    this.name = "EmbedNotSupportedError";
  }
}

export class EmbedRenderError extends Error {
  public readonly statusCode: number;
  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.name = "EmbedRenderError";
    this.statusCode = statusCode;
  }
}

function parseEmbedInput(input: unknown): EmbedInput {
  if (!input || typeof input !== "object") {
    throw new NotFoundError("Invalid request");
  }

  const obj = input as Record<string, unknown>;

  if (typeof obj.shortlink !== "string" || obj.shortlink.trim() === "") {
    throw new NotFoundError("shortlink is required");
  }

  let theme: "light" | "dark" = "light";
  if (obj.theme === "dark") {
    theme = "dark";
  }

  return { shortlink: obj.shortlink, theme };
}

export const embedFlow = flow({
  name: "embed",
  deps: {
    diagramStore: diagramStoreAtom,
    d2Renderer: d2RendererAtom,
    mermaidRenderer: optionalMermaidRendererAtom,
    logger: loggerAtom,
  },
  parse: (raw: unknown) => parseEmbedInput(raw),
  factory: async (ctx, { diagramStore, d2Renderer, mermaidRenderer, logger }): Promise<EmbedOutput> => {
    const { input } = ctx;

    logger.debug({ shortlink: input.shortlink, theme: input.theme }, "Embedding diagram");

    const diagram = diagramStore.get(input.shortlink);

    if (!diagram) {
      logger.debug({ shortlink: input.shortlink }, "Diagram not found");
      throw new NotFoundError("Diagram not found");
    }

    // Update access time for retention
    diagramStore.touch(input.shortlink);

    let svg: string;

    if (diagram.format === "d2") {
      try {
        svg = await d2Renderer.render(diagram.source, input.theme ?? "light");
      } catch (err) {
        logger.error({ shortlink: input.shortlink, error: err }, "D2 render failed");
        throw new EmbedRenderError(`D2 render failed: ${(err as Error).message}`);
      }
    } else if (diagram.format === "mermaid") {
      if (!mermaidRenderer) {
        logger.debug({ shortlink: input.shortlink }, "Mermaid SSR not available");
        throw new EmbedNotSupportedError("Mermaid SSR not configured. Set CHROME_PATH environment variable.");
      }
      try {
        svg = await mermaidRenderer.render(diagram.source);
      } catch (err) {
        const message = (err as Error).message;
        logger.error({ shortlink: input.shortlink, error: err }, "Mermaid render failed");

        // Map specific errors to appropriate status codes
        if (message.includes("forbidden")) {
          throw new EmbedRenderError(message, 400);
        }
        if (message.includes("queue full")) {
          throw new EmbedRenderError("Service busy, try again later", 503);
        }
        if (message.includes("timeout")) {
          throw new EmbedRenderError("Render timeout", 504);
        }
        throw new EmbedRenderError(`Mermaid render failed: ${message}`);
      }
    } else {
      throw new EmbedNotSupportedError(`Unsupported format: ${diagram.format}`);
    }

    logger.debug({ shortlink: input.shortlink, format: diagram.format }, "Generated embed SVG");

    return {
      svg,
      contentType: "image/svg+xml",
    };
  },
});
