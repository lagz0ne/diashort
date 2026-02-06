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

export interface VersionRecord {
  name: string;
  createdAt: number;
  auto: boolean;
}

export class ConflictError extends Error {
  public readonly statusCode = 409;
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
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
  createVersion(diagramId: string, versionName: string | null, source: string): { versionName: string };
  getVersionSource(diagramId: string, versionName: string): { source: string; format: DiagramFormat } | null;
  listVersions(diagramId: string): VersionRecord[];
  getLatestVersionName(diagramId: string): string | null;
  hasMultipleVersions(diagramId: string): boolean;
}

export const diagramStoreAtom = atom({
  deps: {
    config: tags.required(diagramConfigTag),
    logger: loggerAtom,
  },
  factory: (ctx, { config, logger }): DiagramStore => {
    const db = new Database(config.dbPath);

    // Enable foreign keys (must be per-connection)
    db.exec("PRAGMA foreign_keys = ON");

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

      CREATE TABLE IF NOT EXISTS diagram_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        diagram_id TEXT NOT NULL,
        version_name TEXT NOT NULL,
        source TEXT NOT NULL,
        is_auto INTEGER NOT NULL DEFAULT 0,
        createdAt INTEGER NOT NULL,
        UNIQUE(diagram_id, version_name),
        FOREIGN KEY (diagram_id) REFERENCES diagrams(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_versions_diagram
        ON diagram_versions(diagram_id);
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

        const insertDiagram = db.prepare(`
          INSERT INTO diagrams (id, source, format, createdAt, accessedAt)
          VALUES (?, ?, ?, ?, ?)
        `);

        const insertVersion = db.prepare(`
          INSERT INTO diagram_versions (diagram_id, version_name, source, is_auto, createdAt)
          VALUES (?, 'v1', ?, 1, ?)
        `);

        const txn = db.transaction(() => {
          insertDiagram.run(id, source, format, now, now);
          insertVersion.run(id, source, now);
        });

        txn();

        logger.debug({ shortlink: id, format }, "Diagram created with v1");
        return id;
      },

      get(id: string): { source: string; format: DiagramFormat } | null {
        const stmt = db.prepare(`
          SELECT source, format FROM diagrams WHERE id = ?
        `);

        const row = stmt.get(id) as { source: string; format: string } | null;
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
        const stmt = db.prepare(`
          UPDATE diagrams SET accessedAt = ? WHERE id = ?
        `);
        stmt.run(now, id);
        logger.debug({ shortlink: id }, "Diagram accessed");
      },

      cleanup(): void {
        const retentionMs = config.retentionDays * 24 * 60 * 60 * 1000;
        const cutoffTime = Date.now() - retentionMs;

        const stmt = db.prepare(`
          DELETE FROM diagrams WHERE accessedAt < ?
        `);

        const result = stmt.run(cutoffTime);

        if (result.changes > 0) {
          logger.info(
            { deletedCount: result.changes, retentionDays: config.retentionDays },
            "Cleaned up old diagrams"
          );
        }
      },

      createVersion(diagramId: string, versionName: string | null, source: string): { versionName: string } {
        const now = Date.now();

        const txn = db.transaction(() => {
          // Check diagram exists
          const diagram = db.prepare(`SELECT source, format FROM diagrams WHERE id = ?`).get(diagramId) as { source: string; format: string } | null;
          if (!diagram) {
            throw new DiagramNotFoundError("Diagram not found");
          }

          // Check if version rows exist
          const versionCount = (db.prepare(`SELECT COUNT(*) as cnt FROM diagram_versions WHERE diagram_id = ?`).get(diagramId) as { cnt: number }).cnt;

          // Backfill v1 if legacy diagram (no version rows)
          if (versionCount === 0) {
            db.prepare(`
              INSERT INTO diagram_versions (diagram_id, version_name, source, is_auto, createdAt)
              VALUES (?, 'v1', ?, 1, ?)
            `).run(diagramId, diagram.source, now);
          }

          // Determine version name
          let resolvedName: string;
          let isAuto: boolean;

          if (versionName !== null) {
            resolvedName = versionName;
            isAuto = false;
          } else {
            // Auto-generate: find max auto version number
            const maxRow = db.prepare(`
              SELECT MAX(CAST(SUBSTR(version_name, 2) AS INTEGER)) as max_num
              FROM diagram_versions
              WHERE diagram_id = ? AND is_auto = 1
            `).get(diagramId) as { max_num: number | null };

            const nextNum = (maxRow.max_num ?? 0) + 1;
            resolvedName = `v${nextNum}`;
            isAuto = true;
          }

          // Insert new version (UNIQUE constraint catches duplicates)
          try {
            db.prepare(`
              INSERT INTO diagram_versions (diagram_id, version_name, source, is_auto, createdAt)
              VALUES (?, ?, ?, ?, ?)
            `).run(diagramId, resolvedName, source, isAuto ? 1 : 0, now);
          } catch (err) {
            if (err instanceof Error && err.message.includes("UNIQUE constraint failed")) {
              throw new ConflictError(`Version '${resolvedName}' already exists for this diagram`);
            }
            throw err;
          }

          // Update diagrams.source to latest
          db.prepare(`UPDATE diagrams SET source = ? WHERE id = ?`).run(source, diagramId);

          return resolvedName;
        });

        const resolvedName = txn() as string;
        logger.debug({ shortlink: diagramId, version: resolvedName }, "Version created");
        return { versionName: resolvedName };
      },

      getVersionSource(diagramId: string, versionName: string): { source: string; format: DiagramFormat } | null {
        // Try version table first
        const row = db.prepare(`
          SELECT dv.source, d.format
          FROM diagram_versions dv
          JOIN diagrams d ON d.id = dv.diagram_id
          WHERE dv.diagram_id = ? AND dv.version_name = ?
        `).get(diagramId, versionName) as { source: string; format: string } | null;

        if (row) {
          return { source: row.source, format: row.format as DiagramFormat };
        }

        // Legacy fallback: if requesting v1 and no version rows exist
        if (versionName === "v1") {
          const versionCount = (db.prepare(`SELECT COUNT(*) as cnt FROM diagram_versions WHERE diagram_id = ?`).get(diagramId) as { cnt: number }).cnt;
          if (versionCount === 0) {
            return this.get(diagramId);
          }
        }

        return null;
      },

      listVersions(diagramId: string): VersionRecord[] {
        const rows = db.prepare(`
          SELECT version_name, createdAt, is_auto
          FROM diagram_versions
          WHERE diagram_id = ?
          ORDER BY id ASC
        `).all(diagramId) as Array<{ version_name: string; createdAt: number; is_auto: number }>;

        if (rows.length > 0) {
          return rows.map(r => ({ name: r.version_name, createdAt: r.createdAt, auto: r.is_auto === 1 }));
        }

        // Legacy fallback: synthesize from diagrams table
        const diagram = db.prepare(`SELECT createdAt FROM diagrams WHERE id = ?`).get(diagramId) as { createdAt: number } | null;
        if (diagram) {
          return [{ name: "v1", createdAt: diagram.createdAt, auto: true }];
        }

        return [];
      },

      getLatestVersionName(diagramId: string): string | null {
        const row = db.prepare(`
          SELECT version_name FROM diagram_versions
          WHERE diagram_id = ?
          ORDER BY id DESC
          LIMIT 1
        `).get(diagramId) as { version_name: string } | null;

        if (row) {
          return row.version_name;
        }

        // Legacy: check if diagram exists at all
        const exists = db.prepare(`SELECT 1 FROM diagrams WHERE id = ?`).get(diagramId);
        return exists ? "v1" : null;
      },

      hasMultipleVersions(diagramId: string): boolean {
        const row = db.prepare(`
          SELECT COUNT(*) as cnt FROM diagram_versions WHERE diagram_id = ?
        `).get(diagramId) as { cnt: number };
        return row.cnt > 1;
      },
    };

    return store;
  },
});
