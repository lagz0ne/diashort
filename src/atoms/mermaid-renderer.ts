import { atom } from "@pumped-fn/lite";
import { browserPoolAtom, type BrowserPool } from "./browser-pool";
import { loggerAtom } from "./logger";

export class MermaidRenderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MermaidRenderError";
  }
}

export interface MermaidRenderer {
  render(source: string, outputType: "svg" | "png"): Promise<Uint8Array>;
}

export const mermaidRendererAtom = atom({
  deps: {
    pool: browserPoolAtom,
    logger: loggerAtom,
  },
  factory: (_ctx, { pool, logger }): MermaidRenderer => {
    return {
      render: async (source: string, outputType: "svg" | "png"): Promise<Uint8Array> => {
        const browser = await pool.acquire();

        try {
          logger.debug({ outputType }, "Rendering mermaid diagram");

          const { renderMermaid } = await import("@mermaid-js/mermaid-cli");

          const result = await renderMermaid(browser, source, outputType, {
            backgroundColor: "transparent",
          });

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
