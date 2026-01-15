import { atom, tags } from "@pumped-fn/lite";
import { Database } from "bun:sqlite";
import { diagramConfigTag } from "../config/tags";
import { loggerAtom } from "./logger";
import type { DiagramFormat } from "./diagram-store";

export interface DiffRecord {
  id: string;
  format: DiagramFormat;
  before: string;
  after: string;
  createdAt: number;
  accessedAt: number;
}

export interface CreateDiffInput {
  format: DiagramFormat;
  before: string;
  after: string;
}

export interface DiffStore {
  create(input: CreateDiffInput): string;
  get(id: string): { format: DiagramFormat; before: string; after: string } | null;
  touch(id: string): void;
  cleanup(): void;
}

export const diffStoreAtom = atom({
  deps: {
    config: tags.required(diagramConfigTag),
    logger: loggerAtom,
  },
  factory: (ctx, { config, logger }): DiffStore => {
    const db = new Database(config.dbPath);

    // Initialize schema (auto-migration: CREATE TABLE IF NOT EXISTS)
    db.exec(`
      CREATE TABLE IF NOT EXISTS diagram_diffs (
        id TEXT PRIMARY KEY,
        format TEXT NOT NULL,
        source_before TEXT NOT NULL,
        source_after TEXT NOT NULL,
        createdAt INTEGER NOT NULL,
        accessedAt INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_diffs_accessed
        ON diagram_diffs(accessedAt);
    `);

    logger.debug({ dbPath: config.dbPath }, "Diff store initialized");

    ctx.cleanup(() => {
      logger.debug("Closing diff store database");
      db.close();
    });

    const store: DiffStore = {
      create(input: CreateDiffInput): string {
        const id = crypto.randomUUID().slice(0, 8);
        const now = Date.now();

        const stmt = db.prepare(`
          INSERT INTO diagram_diffs (id, format, source_before, source_after, createdAt, accessedAt)
          VALUES (?, ?, ?, ?, ?, ?)
        `);

        stmt.run(id, input.format, input.before, input.after, now, now);

        logger.debug({ shortlink: id, format: input.format }, "Diff created");
        return id;
      },

      get(id: string): { format: DiagramFormat; before: string; after: string } | null {
        const stmt = db.prepare(`
          SELECT format, source_before, source_after FROM diagram_diffs WHERE id = ?
        `);

        const row = stmt.get(id) as { format: string; source_before: string; source_after: string } | null;
        if (!row) {
          return null;
        }

        return {
          format: row.format as DiagramFormat,
          before: row.source_before,
          after: row.source_after,
        };
      },

      touch(id: string): void {
        const now = Date.now();
        const stmt = db.prepare(`
          UPDATE diagram_diffs SET accessedAt = ? WHERE id = ?
        `);
        stmt.run(now, id);
        logger.debug({ shortlink: id }, "Diff accessed");
      },

      cleanup(): void {
        const retentionMs = config.retentionDays * 24 * 60 * 60 * 1000;
        const cutoffTime = Date.now() - retentionMs;

        const stmt = db.prepare(`
          DELETE FROM diagram_diffs WHERE accessedAt < ?
        `);

        const result = stmt.run(cutoffTime);

        if (result.changes > 0) {
          logger.info(
            { deletedCount: result.changes, retentionDays: config.retentionDays },
            "Cleaned up old diffs"
          );
        }
      },
    };

    return store;
  },
});
