import { atom, tags } from "@pumped-fn/lite";
import { Database } from "bun:sqlite";
import { diagramConfigTag } from "../config/tags";
import { loggerAtom } from "./logger";

export type DiagramFormat = "mermaid" | "d2";

export interface DiagramRecord {
  id: string;
  source: string;
  format: DiagramFormat;
  createdAt: number;
  accessedAt: number;
}

export class DiagramNotFoundError extends Error {
  public readonly statusCode = 404;
  constructor(message: string) {
    super(message);
    this.name = "DiagramNotFoundError";
  }
}

export interface DiagramStore {
  create(source: string, format: DiagramFormat): string;
  get(id: string): { source: string; format: DiagramFormat } | null;
  touch(id: string): void;
  cleanup(): void;
}

export const diagramStoreAtom = atom({
  deps: {
    config: tags.required(diagramConfigTag),
    logger: loggerAtom,
  },
  factory: (ctx, { config, logger }): DiagramStore => {
    const db = new Database(config.dbPath);

    // Initialize schema
    db.exec(`
      CREATE TABLE IF NOT EXISTS diagrams (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        format TEXT NOT NULL,
        createdAt INTEGER NOT NULL,
        accessedAt INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_diagrams_accessed
        ON diagrams(accessedAt);
    `);

    logger.debug({ dbPath: config.dbPath }, "Diagram store initialized");

    // Cleanup handler to close database
    ctx.cleanup(() => {
      logger.debug("Closing diagram store database");
      db.close();
    });

    const store: DiagramStore = {
      create(source: string, format: DiagramFormat): string {
        const id = crypto.randomUUID().slice(0, 8);
        const now = Date.now();

        db.prepare(`
          INSERT INTO diagrams (id, source, format, createdAt, accessedAt)
          VALUES (?, ?, ?, ?, ?)
        `).run(id, source, format, now, now);

        logger.debug({ shortlink: id, format }, "Diagram created");
        return id;
      },

      get(id: string): { source: string; format: DiagramFormat } | null {
        const row = db.prepare(`
          SELECT source, format FROM diagrams WHERE id = ?
        `).get(id) as { source: string; format: string } | null;

        if (!row) {
          return null;
        }

        return {
          source: row.source,
          format: row.format as DiagramFormat,
        };
      },

      touch(id: string): void {
        const now = Date.now();
        db.prepare(`
          UPDATE diagrams SET accessedAt = ? WHERE id = ?
        `).run(now, id);
        logger.debug({ shortlink: id }, "Diagram accessed");
      },

      cleanup(): void {
        const retentionMs = config.retentionDays * 24 * 60 * 60 * 1000;
        const cutoffTime = Date.now() - retentionMs;

        const result = db.prepare(`
          DELETE FROM diagrams WHERE accessedAt < ?
        `).run(cutoffTime);

        if (result.changes > 0) {
          logger.info(
            { deletedCount: result.changes, retentionDays: config.retentionDays },
            "Cleaned up old diagrams"
          );
        }
      },
    };

    return store;
  },
});
