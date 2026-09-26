import type { SqlClient } from './sql-client';

/**
 * Same tables as the SQLite adapter. Timestamps are ISO-8601 text (they sort
 * correctly and round-trip exactly); JSON value objects are text too, so both
 * adapters store identical data. Idempotent: safe to run on every boot.
 */
export async function migrate(client: SqlClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS attempts (
      id TEXT PRIMARY KEY,
      learner_id TEXT NOT NULL,
      problem_id TEXT NOT NULL,
      draft TEXT NOT NULL,
      revealed_hints TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_attempts_learner ON attempts (learner_id, problem_id, updated_at);

    CREATE TABLE IF NOT EXISTS submissions (
      id TEXT PRIMARY KEY,
      attempt_id TEXT NOT NULL REFERENCES attempts(id),
      learner_id TEXT NOT NULL,
      problem_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      format TEXT NOT NULL,
      draft TEXT NOT NULL,
      design TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      hints_used INTEGER NOT NULL,
      status TEXT NOT NULL,
      status_message TEXT,
      submitted_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (attempt_id, version)
    );
    CREATE INDEX IF NOT EXISTS idx_submissions_learner ON submissions (learner_id, submitted_at);
    CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions (status, updated_at);

    CREATE TABLE IF NOT EXISTS evaluations (
      id TEXT PRIMARY KEY,
      submission_id TEXT NOT NULL UNIQUE REFERENCES submissions(id),
      report TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS evaluation_jobs (
      id TEXT PRIMARY KEY,
      submission_id TEXT NOT NULL REFERENCES submissions(id),
      status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'done', 'dead')),
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL,
      run_at TEXT NOT NULL,
      locked_at TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_jobs_due ON evaluation_jobs (status, run_at);
  `);
}
