import { atom } from "@pumped-fn/lite";
import { browserPoolAtom, type BrowserPool } from "./browser-pool";
import { loggerAtom } from "./logger";

export class MermaidRenderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MermaidRenderError";
  }
}

export interface MermaidRenderOptions {
  scale?: number;
}

export interface MermaidRenderer {
  render(source: string, outputType: "svg" | "png", options?: MermaidRenderOptions): Promise<Uint8Array>;
}

export const mermaidRendererAtom = atom({
  deps: {
    pool: browserPoolAtom,
    logger: loggerAtom,
  },
  factory: (_ctx, { pool, logger }): MermaidRenderer => {
    return {
      render: async (source: string, outputType: "svg" | "png", options?: MermaidRenderOptions): Promise<Uint8Array> => {
        const browser = await pool.acquire();

        try {
          const scale = options?.scale ?? 1;
          logger.debug({ outputType, scale }, "Rendering mermaid diagram");

          const { renderMermaid } = await import("@mermaid-js/mermaid-cli");

          const renderOptions: Record<string, unknown> = {
            backgroundColor: "transparent",
          };

          // For PNG, use deviceScaleFactor to increase resolution
          if (outputType === "png" && scale > 1) {
            renderOptions.viewport = {
              deviceScaleFactor: scale,
            };
          }

          const result = await renderMermaid(browser, source, outputType, renderOptions);

          logger.debug("Mermaid render complete");

          return result.data;
        } catch (error) {
          logger.error({ error }, "Mermaid render failed");
          throw new MermaidRenderError(
            error instanceof Error ? error.message : String(error)
          );
        } finally {
          pool.release(browser);
        }
      },
    };
  },
});
