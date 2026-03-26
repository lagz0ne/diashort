import { atom } from "@pumped-fn/lite";
import { loggerAtom } from "./logger";
import { $ } from "bun";

export interface D2Renderer {
  render(source: string, theme: "light" | "dark"): Promise<string>;
}

function createD2Renderer(logger: { debug: (...args: unknown[]) => void; error: (...args: unknown[]) => void }): D2Renderer {
  return {
    async render(source: string, theme: "light" | "dark"): Promise<string> {
      // D2 theme IDs: 0=Neutral default, 1=Neutral Grey, 3=Flagship, 4=Cool classics
      // 200=Dark Mauve, 201=Dark Flagship
      const themeId = theme === "dark" ? "200" : "1";

      try {
        // Write source to stdin, get SVG from stdout
        const result = await $`echo ${source} | d2 --theme=${themeId} - -`.quiet();
        const svg = result.stdout.toString();

        if (!svg.includes("<svg")) {
          throw new Error("D2 did not produce valid SVG");
        }

        logger.debug({ theme, themeId }, "D2 diagram rendered");
        return svg;
      } catch (err) {
        logger.error({ err, source: source.slice(0, 100) }, "D2 render failed");
        throw new Error(`D2 render failed: ${err instanceof Error ? err.message : err}`);
      }
    },
  };
}

export const d2RendererAtom = atom({
  deps: {
    logger: loggerAtom,
  },
  factory: (_ctx, { logger }): D2Renderer => createD2Renderer(logger),
});

export const optionalD2RendererAtom = atom({
  deps: {
    logger: loggerAtom,
  },
  factory: (_ctx, { logger }): D2Renderer | undefined => {
    if (!Bun.which("d2")) {
      logger.debug("D2 CLI not found, D2 validation disabled");
      return undefined;
    }
    return createD2Renderer(logger);
  },
});
