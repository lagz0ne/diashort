// src/atoms/mermaid-renderer.ts
import { atom, tags } from "@pumped-fn/lite";
import { Database } from "bun:sqlite";
import { createBrowserFarm } from "./browser-farm";
import { loggerAtom } from "./logger";
import { mermaidConfigTag } from "../config/tags";

export type { MermaidConfig } from "../config/tags";

export interface MermaidRenderer {
  render: (source: string) => Promise<string>;
}

export const mermaidRendererAtom = atom({
  deps: {
    config: tags.required(mermaidConfigTag),
    logger: loggerAtom,
  },
  factory: async (ctx, { config, logger }): Promise<MermaidRenderer> => {
    const db = new Database(config.dbPath);

    // Enable WAL for the atom's DB connection too
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA busy_timeout = 5000");

    const farm = createBrowserFarm({
      executablePath: config.executablePath,
      db,
      poolSize: config.poolSize,
      timeout: config.timeout,
      noSandbox: config.noSandbox,
      maxQueueSize: config.maxQueueSize,
    });

    // Handle DB cleanup if start fails
    try {
      await farm.start();
    } catch (err) {
      db.close();
      throw err;
    }

    logger.info({ poolSize: config.poolSize ?? 2 }, "Mermaid renderer started");

    ctx.cleanup(async () => {
      logger.info("Stopping mermaid renderer");
      await farm.stop();
      db.close();
    });

    return {
      render: (source: string) => farm.render(source),
    };
  },
});

/**
 * Optional mermaid renderer atom that returns undefined when CHROME_PATH is not configured.
 * Use this in flows that need to gracefully handle missing mermaid SSR support.
 */
export const optionalMermaidRendererAtom = atom({
  deps: {
    config: tags.optional(mermaidConfigTag),
    logger: loggerAtom,
  },
  factory: async (ctx, { config, logger }): Promise<MermaidRenderer | undefined> => {
    if (!config) {
      logger.debug("Mermaid SSR not configured (CHROME_PATH not set)");
      return undefined;
    }

    const db = new Database(config.dbPath);

    // Enable WAL for the atom's DB connection too
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA busy_timeout = 5000");

    const farm = createBrowserFarm({
      executablePath: config.executablePath,
      db,
      poolSize: config.poolSize,
      timeout: config.timeout,
      noSandbox: config.noSandbox,
      maxQueueSize: config.maxQueueSize,
    });

    // Handle DB cleanup if start fails
    try {
      await farm.start();
    } catch (err) {
      db.close();
      throw err;
    }

    logger.info({ poolSize: config.poolSize ?? 2 }, "Mermaid renderer started");

    ctx.cleanup(async () => {
      logger.info("Stopping mermaid renderer");
      await farm.stop();
      db.close();
    });

    return {
      render: (source: string) => farm.render(source),
    };
  },
});
