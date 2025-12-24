import { atom, tags } from "@pumped-fn/lite";
import { Database } from "bun:sqlite";
import { jobConfigTag } from "../config/tags";
import { loggerAtom } from "./logger";
import type { Logger } from "pino";

export type JobStatus = "pending" | "rendering" | "completed" | "failed";

export interface JobInput {
  source: string;
  format: "mermaid" | "d2" | "plantuml" | "graphviz";
  outputType: "svg" | "png";
}

export interface JobRecord extends JobInput {
  id: string;
  status: JobStatus;
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
  shortlink?: string;
  error?: string;
}

export interface JobStore {
  create(input: JobInput): string;
  get(id: string): JobRecord | null;
  updateStatus(
    id: string,
    status: JobStatus,
    metadata?: { shortlink?: string; error?: string }
  ): void;
  getPending(): JobRecord | null;
  cleanup(): void;
}

export const jobStoreAtom = atom({
  deps: {
    config: tags.required(jobConfigTag),
    logger: loggerAtom,
  },
  factory: (ctx, { config, logger }): JobStore => {
    const db = new Database(config.dbPath);

    // Initialize schema
    db.exec(`
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        format TEXT NOT NULL,
        outputType TEXT NOT NULL,
        status TEXT NOT NULL,
        createdAt INTEGER NOT NULL,
        startedAt INTEGER,
        completedAt INTEGER,
        shortlink TEXT,
        error TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_jobs_status_created
        ON jobs(status, createdAt);

      CREATE INDEX IF NOT EXISTS idx_jobs_completed
        ON jobs(completedAt);
    `);

    logger.debug({ dbPath: config.dbPath }, "Job store initialized");

    // Cleanup handler to close database
    ctx.cleanup(() => {
      logger.debug("Closing job store database");
      db.close();
    });

    const store: JobStore = {
      create(input: JobInput): string {
        const id = `job_${crypto.randomUUID().slice(0, 8)}`;
        const now = Date.now();

        const stmt = db.prepare(`
          INSERT INTO jobs (id, source, format, outputType, status, createdAt, startedAt, completedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(id, input.source, input.format, input.outputType, "pending", now, null, null);

        logger.debug({ jobId: id, format: input.format }, "Job created");
        return id;
      },

      get(id: string): JobRecord | null {
        const stmt = db.prepare(`
          SELECT * FROM jobs WHERE id = ?
        `);

        const row = stmt.get(id) as any;
        if (!row) {
          return null;
        }

        return {
          id: row.id,
          source: row.source,
          format: row.format,
          outputType: row.outputType,
          status: row.status,
          createdAt: row.createdAt,
          startedAt: row.startedAt,
          completedAt: row.completedAt,
          shortlink: row.shortlink || undefined,
          error: row.error || undefined,
        };
      },

      updateStatus(
        id: string,
        status: JobStatus,
        metadata?: { shortlink?: string; error?: string }
      ): void {
        const now = Date.now();

        // Determine which timestamp to update based on status
        let updateFields = `status = ?, shortlink = ?, error = ?`;
        const params: any[] = [status, metadata?.shortlink || null, metadata?.error || null];

        if (status === "rendering") {
          updateFields += `, startedAt = ?`;
          params.push(now);
        } else if (status === "completed" || status === "failed") {
          updateFields += `, completedAt = ?`;
          params.push(now);
        }

        params.push(id);

        const stmt = db.prepare(`
          UPDATE jobs
          SET ${updateFields}
          WHERE id = ?
        `);

        stmt.run(...params);

        logger.debug(
          { jobId: id, status, metadata },
          "Job status updated"
        );
      },

      getPending(): JobRecord | null {
        const stmt = db.prepare(`
          SELECT * FROM jobs
          WHERE status = 'pending'
          ORDER BY createdAt ASC
          LIMIT 1
        `);

        const row = stmt.get() as any;
        if (!row) {
          return null;
        }

        return {
          id: row.id,
          source: row.source,
          format: row.format,
          outputType: row.outputType,
          status: row.status,
          createdAt: row.createdAt,
          startedAt: row.startedAt,
          completedAt: row.completedAt,
          shortlink: row.shortlink || undefined,
          error: row.error || undefined,
        };
      },

      cleanup(): void {
        const cutoffTime = Date.now() - config.retentionMs;

        const stmt = db.prepare(`
          DELETE FROM jobs
          WHERE completedAt < ? AND status IN ('completed', 'failed')
        `);

        const result = stmt.run(cutoffTime);

        if (result.changes > 0) {
          logger.info(
            { deletedCount: result.changes, cutoffTime },
            "Cleaned up old jobs"
          );
        }
      },
    };

    return store;
  },
});
