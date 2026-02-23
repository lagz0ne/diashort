import { flow } from "@pumped-fn/lite";
import { diagramStoreAtom } from "../atoms/diagram-store";
import { htmlGeneratorAtom, type VersionInfo } from "../atoms/html-generator";
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
  versionName?: string;
}

export interface ViewOutput {
  html: string;
  contentType: "text/html";
  redirect?: string;
}

function parseViewInput(input: unknown): ViewInput {
  if (!input || typeof input !== "object") {
    throw new NotFoundError("Invalid request");
  }

  const obj = input as Record<string, unknown>;

  if (typeof obj.shortlink !== "string" || obj.shortlink.trim() === "") {
    throw new NotFoundError("shortlink is required");
  }

  const result: ViewInput = { shortlink: obj.shortlink };
  if (typeof obj.versionName === "string" && obj.versionName.trim() !== "") {
    result.versionName = obj.versionName;
  }

  return result;
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
  parse: (raw: unknown) => parseViewInput(raw),
  factory: async (ctx, { diagramStore, htmlGenerator, d2Renderer, mermaidRenderer, logger }): Promise<ViewOutput> => {
    const { input } = ctx;

    const configuredBaseUrl = ctx.data.seekTag(baseUrlTag);
    const requestOrigin = ctx.data.seekTag(requestOriginTag) ?? "";
    const baseUrl = configuredBaseUrl || requestOrigin;

    logger.debug({ shortlink: input.shortlink, versionName: input.versionName }, "Viewing diagram");

    // Check diagram exists
    const diagram = diagramStore.get(input.shortlink);
    if (!diagram) {
      logger.debug({ shortlink: input.shortlink }, "Diagram not found");
      throw new NotFoundError("Diagram not found");
    }

    // If no version specified, redirect to latest
    if (!input.versionName) {
      const latestVersion = diagramStore.getLatestVersionName(input.shortlink);
      if (!latestVersion) {
        throw new NotFoundError("Diagram not found");
      }
      return {
        html: "",
        contentType: "text/html",
        redirect: `/d/${input.shortlink}/${latestVersion}`,
      };
    }

    // Serve specific version
    const versionData = diagramStore.getVersionSource(input.shortlink, input.versionName);
    if (!versionData) {
      throw new NotFoundError("Version not found");
    }

    // Update access time for retention
    diagramStore.touch(input.shortlink);

    const versionInfo: VersionInfo = {
      shortlink: input.shortlink,
      currentVersion: input.versionName,
      versionsApiUrl: `/api/d/${input.shortlink}/versions`,
      format: versionData.format,
    };

    let html: string;

    if (versionData.format === "d2") {
      const [lightSvg, darkSvg] = await Promise.all([
        d2Renderer.render(versionData.source, "light"),
        d2Renderer.render(versionData.source, "dark"),
      ]);

      const embedUrl = baseUrl ? `${baseUrl}/e/${input.shortlink}/${input.versionName}` : undefined;
      html = htmlGenerator.generateD2(lightSvg, darkSvg, input.shortlink, { embedUrl, versionInfo });
      logger.debug({ shortlink: input.shortlink, version: input.versionName }, "Generated D2 HTML page");
    } else {
      if (!mermaidRenderer) {
        throw new RenderNotAvailableError("Mermaid SSR not configured. Set CHROME_PATH environment variable.");
      }

      const svg = await mermaidRenderer.render(versionData.source);
      const embedUrl = baseUrl ? `${baseUrl}/e/${input.shortlink}/${input.versionName}` : undefined;
      html = htmlGenerator.generateMermaid(svg, input.shortlink, { embedUrl, versionInfo });
      logger.debug({ shortlink: input.shortlink, version: input.versionName }, "Generated Mermaid HTML page");
    }

    return {
      html,
      contentType: "text/html",
    };
  },
});
