import { flow } from "@pumped-fn/lite";
import { diagramStoreAtom } from "../atoms/diagram-store";
import { htmlGeneratorAtom } from "../atoms/html-generator";
import { d2RendererAtom } from "../atoms/d2-renderer";
import { optionalMermaidRendererAtom } from "../atoms/mermaid-renderer";
import { loggerAtom } from "../atoms/logger";
import { baseUrlTag, requestOriginTag } from "../config/tags";

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

export class RenderNotAvailableError extends Error {
  public readonly statusCode = 503;
  constructor(message: string) {
    super(message);
    this.name = "RenderNotAvailableError";
  }
}

export const viewFlow = flow({
  name: "view",
  deps: {
    diagramStore: diagramStoreAtom,
    htmlGenerator: htmlGeneratorAtom,
    d2Renderer: d2RendererAtom,
    mermaidRenderer: optionalMermaidRendererAtom,
    logger: loggerAtom,
  },
  parse: (raw: unknown) => {
    if (!raw || typeof raw !== "object") {
      throw new NotFoundError("Invalid request");
    }
    const obj = raw as Record<string, unknown>;
    if (typeof obj.shortlink !== "string" || obj.shortlink.trim() === "") {
      throw new NotFoundError("shortlink is required");
    }
    return { shortlink: obj.shortlink };
  },
  factory: async (ctx, { diagramStore, htmlGenerator, d2Renderer, mermaidRenderer, logger }): Promise<ViewOutput> => {
    const { input } = ctx;

    const configuredBaseUrl = ctx.data.seekTag(baseUrlTag);
    const requestOrigin = ctx.data.seekTag(requestOriginTag) ?? "";
    const baseUrl = configuredBaseUrl || requestOrigin;

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
      const [lightSvg, darkSvg] = await Promise.all([
        d2Renderer.render(diagram.source, "light"),
        d2Renderer.render(diagram.source, "dark"),
      ]);

      const embedUrl = baseUrl ? `${baseUrl}/e/${input.shortlink}` : undefined;
      html = htmlGenerator.generateD2(lightSvg, darkSvg, input.shortlink, { embedUrl });
      logger.debug({ shortlink: input.shortlink }, "Generated D2 HTML page");
    } else {
      if (!mermaidRenderer) {
        throw new RenderNotAvailableError("Mermaid SSR not configured. Set CHROME_PATH environment variable.");
      }

      const svg = await mermaidRenderer.render(diagram.source);
      const embedUrl = baseUrl ? `${baseUrl}/e/${input.shortlink}` : undefined;
      html = htmlGenerator.generateMermaid(svg, input.shortlink, { embedUrl });
      logger.debug({ shortlink: input.shortlink }, "Generated Mermaid HTML page");
    }

    return { html, contentType: "text/html" };
  },
});
