import type { Database } from "bun:sqlite";

export interface RenderJob {
  id: string;
  source: string;
  retries: number;
  browser_id: string;
}

export interface QueueConfig {
  leaseTtl?: number;
  maxRetries?: number;
}

export function createRenderQueue(db: Database, config: QueueConfig = {}) {
  const leaseTtl = config.leaseTtl ?? 30_000;
  const maxRetries = config.maxRetries ?? 2;

  // Enable WAL mode and busy timeout for concurrency
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA busy_timeout = 5000");

  db.exec(`
    CREATE TABLE IF NOT EXISTS render_jobs (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      state TEXT DEFAULT 'pending',
      retries INTEGER DEFAULT 0,
      browser_id TEXT,
      created_at INTEGER NOT NULL,
      claimed_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_jobs_state ON render_jobs(state);
    CREATE INDEX IF NOT EXISTS idx_jobs_browser ON render_jobs(browser_id);
  `);

  const stmts = {
    insert: db.prepare(
      `INSERT INTO render_jobs (id, source, created_at) VALUES (?, ?, ?)`
    ),
    // Claim uses lease-based TTL on claimed_at, not created_at
    claim: db.prepare(`
      UPDATE render_jobs
      SET state = 'processing', browser_id = ?, claimed_at = ?
      WHERE id = (
        SELECT id FROM render_jobs
        WHERE state = 'pending'
        ORDER BY created_at LIMIT 1
      )
      RETURNING id, source, retries, browser_id
    `),
    // Complete verifies state and browser ownership
    complete: db.prepare(`
      DELETE FROM render_jobs
      WHERE id = ? AND state = 'processing' AND browser_id = ?
    `),
    // Retry verifies state and browser ownership (maxRetries passed as parameter)
    retry: db.prepare(`
      UPDATE render_jobs
      SET state = 'pending', browser_id = NULL, claimed_at = NULL, retries = retries + 1
      WHERE id = ? AND state = 'processing' AND browser_id = ? AND retries < ?
      RETURNING id
    `),
    // Fail verifies state
    fail: db.prepare(`
      DELETE FROM render_jobs
      WHERE id = ? AND state = 'processing' AND browser_id = ?
    `),
    // Recover all jobs from a specific browser
    recoverBrowser: db.prepare(`
      UPDATE render_jobs
      SET state = 'pending', browser_id = NULL, claimed_at = NULL
      WHERE browser_id = ? AND state = 'processing'
    `),
    // Recover stale processing jobs (lease expired)
    recoverStale: db.prepare(`
      UPDATE render_jobs
      SET state = 'pending', browser_id = NULL, claimed_at = NULL
      WHERE state = 'processing' AND claimed_at < ?
    `),
    hasPending: db.prepare(
      `SELECT 1 FROM render_jobs WHERE state = 'pending' LIMIT 1`
    ),
    // Count pending jobs (for rate limiting)
    countPending: db.prepare(
      `SELECT COUNT(*) as count FROM render_jobs WHERE state = 'pending'`
    ),
    // Count processing jobs (for debugging)
    countProcessing: db.prepare(
      `SELECT COUNT(*) as count FROM render_jobs WHERE state = 'processing'`
    ),
  };

  const staleLeaseTime = () => Date.now() - leaseTtl;

  return {
    enqueue: (source: string) => {
      const id = crypto.randomUUID();
      stmts.insert.run(id, source, Date.now());
      return id;
    },

    claim: (browserId: string) => {
      const now = Date.now();
      return stmts.claim.get(browserId, now) as RenderJob | null;
    },

    // Complete requires browser ownership
    complete: (id: string, browserId: string) => {
      const result = stmts.complete.run(id, browserId);
      return result.changes > 0;
    },

    // Retry requires browser ownership (uses maxRetries from config)
    retry: (id: string, browserId: string) => {
      return stmts.retry.get(id, browserId, maxRetries) !== null;
    },

    // Fail requires browser ownership
    fail: (id: string, browserId: string) => {
      const result = stmts.fail.run(id, browserId);
      return result.changes > 0;
    },

    // Recover all jobs from dead browser
    recoverBrowser: (browserId: string) => {
      return stmts.recoverBrowser.run(browserId).changes;
    },

    // Recover jobs with expired leases (for startup recovery)
    recoverStale: () => {
      return stmts.recoverStale.run(staleLeaseTime()).changes;
    },

    hasPending: () => stmts.hasPending.get() !== null,

    // Rate limiting helper
    countPending: () => (stmts.countPending.get() as { count: number }).count,

    // Debug helper
    countProcessing: () => (stmts.countProcessing.get() as { count: number }).count,
  };
}
