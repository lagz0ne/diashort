import { flow } from "@pumped-fn/lite";
import { diagramStoreAtom } from "../atoms/diagram-store";
import { d2RendererAtom } from "../atoms/d2-renderer";
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
    logger: loggerAtom,
  },
  parse: (raw: unknown) => parseEmbedInput(raw),
  factory: async (ctx, { diagramStore, d2Renderer, logger }): Promise<EmbedOutput> => {
    const { input } = ctx;

    logger.debug({ shortlink: input.shortlink, theme: input.theme }, "Embedding diagram");

    const diagram = diagramStore.get(input.shortlink);

    if (!diagram) {
      logger.debug({ shortlink: input.shortlink }, "Diagram not found");
      throw new NotFoundError("Diagram not found");
    }

    if (diagram.format !== "d2") {
      logger.debug({ shortlink: input.shortlink, format: diagram.format }, "Embed not supported for format");
      throw new EmbedNotSupportedError("Embedding is only supported for D2 diagrams. Mermaid diagrams require client-side rendering.");
    }

    // Update access time for retention
    diagramStore.touch(input.shortlink);

    const svg = await d2Renderer.render(diagram.source, input.theme ?? "light");

    logger.debug({ shortlink: input.shortlink, theme: input.theme }, "Generated embed SVG");

    return {
      svg,
      contentType: "image/svg+xml",
    };
  },
});
