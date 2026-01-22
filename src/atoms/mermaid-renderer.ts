// src/atoms/mermaid-renderer.ts
import { atom, tags } from "@pumped-fn/lite";
import { Database } from "bun:sqlite";
import { createBrowserFarm } from "./browser-farm";
import { loggerAtom } from "./logger";
import { mermaidConfigTag } from "../config/tags";

export type { MermaidConfig } from "../config/tags";

export const mermaidRendererAtom = atom({
  deps: {
    config: tags.required(mermaidConfigTag),
    logger: loggerAtom,
  },
  factory: async (ctx, { config, logger }) => {
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
