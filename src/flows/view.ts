import { flow } from "@pumped-fn/lite";
import { diagramStoreAtom } from "../atoms/diagram-store";
import { htmlGeneratorAtom } from "../atoms/html-generator";
import { d2RendererAtom } from "../atoms/d2-renderer";
import { loggerAtom } from "../atoms/logger";

export class NotFoundError extends Error {
  public readonly statusCode = 404;
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

export interface ViewInput {
  shortlink: string;
}

export interface ViewOutput {
  html: string;
  contentType: "text/html";
}

function parseViewInput(input: unknown): ViewInput {
  if (!input || typeof input !== "object") {
    throw new NotFoundError("Invalid request");
  }

  const obj = input as Record<string, unknown>;

  if (typeof obj.shortlink !== "string" || obj.shortlink.trim() === "") {
    throw new NotFoundError("shortlink is required");
  }

  return { shortlink: obj.shortlink };
}

export const viewFlow = flow({
  name: "view",
  deps: {
    diagramStore: diagramStoreAtom,
    htmlGenerator: htmlGeneratorAtom,
    d2Renderer: d2RendererAtom,
    logger: loggerAtom,
  },
  parse: (raw: unknown) => parseViewInput(raw),
  factory: async (ctx, { diagramStore, htmlGenerator, d2Renderer, logger }): Promise<ViewOutput> => {
    const { input } = ctx;

    logger.debug({ shortlink: input.shortlink }, "Viewing diagram");

    const diagram = diagramStore.get(input.shortlink);

    if (!diagram) {
      logger.debug({ shortlink: input.shortlink }, "Diagram not found");
      throw new NotFoundError("Diagram not found");
    }

    // Update access time for retention
    diagramStore.touch(input.shortlink);

    let html: string;

    if (diagram.format === "d2") {
      // Pre-render D2 server-side for both themes
      const [lightSvg, darkSvg] = await Promise.all([
        d2Renderer.render(diagram.source, "light"),
        d2Renderer.render(diagram.source, "dark"),
      ]);

      html = htmlGenerator.generateD2(lightSvg, darkSvg, input.shortlink);
      logger.debug({ shortlink: input.shortlink }, "Generated D2 HTML page with pre-rendered SVG");
    } else {
      // Mermaid renders client-side
      html = htmlGenerator.generateMermaid(diagram.source, input.shortlink);
      logger.debug({ shortlink: input.shortlink }, "Generated Mermaid HTML page");
    }

    return {
      html,
      contentType: "text/html",
    };
  },
});
