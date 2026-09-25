import type { EvaluationJob, IdGenerator, JobQueue } from '../domain/ports';
import type { Clock } from '../domain/ports';
import type { Database } from './database';

type Row = Record<string, unknown>;

/**
 * A durable job queue in the same SQLite database. Jobs survive restarts,
 * claiming is atomic (single UPDATE … RETURNING), and crashed workers'
 * jobs are released by `releaseStale`. Swappable for BullMQ/SQS via JobQueue.
 */
export class SqliteJobQueue implements JobQueue {
  constructor(
    private readonly db: Database,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async enqueue(submissionId: string, options: { maxAttempts?: number } = {}): Promise<EvaluationJob> {
    const id = this.ids.next('job');
    const now = this.clock.now().toISOString();
    const maxAttempts = options.maxAttempts ?? 3;
    this.db
      .prepare(
        `INSERT INTO evaluation_jobs (id, submission_id, status, attempts, max_attempts, run_at, created_at)
         VALUES (?, ?, 'queued', 0, ?, ?, ?)`,
      )
      .run(id, submissionId, maxAttempts, now, now);
    return { id, submissionId, attempts: 0, maxAttempts };
  }

  async claimNext(now: Date): Promise<EvaluationJob | null> {
    const row = this.db
      .prepare(
        `UPDATE evaluation_jobs
            SET status = 'running', attempts = attempts + 1, locked_at = ?
          WHERE id = (SELECT id FROM evaluation_jobs WHERE status = 'queued' AND run_at <= ? ORDER BY run_at LIMIT 1)
        RETURNING id, submission_id, attempts, max_attempts`,
      )
      .get(now.toISOString(), now.toISOString()) as Row | undefined;
    if (!row) return null;
    return {
      id: row.id as string,
      submissionId: row.submission_id as string,
      attempts: Number(row.attempts),
      maxAttempts: Number(row.max_attempts),
    };
  }

  async complete(jobId: string): Promise<void> {
    this.db.prepare(`UPDATE evaluation_jobs SET status = 'done', locked_at = NULL WHERE id = ?`).run(jobId);
  }

  async fail(jobId: string, error: string, retryAt: Date | null): Promise<void> {
    if (retryAt) {
      this.db
        .prepare(`UPDATE evaluation_jobs SET status = 'queued', run_at = ?, last_error = ?, locked_at = NULL WHERE id = ?`)
        .run(retryAt.toISOString(), error, jobId);
    } else {
      this.db
        .prepare(`UPDATE evaluation_jobs SET status = 'dead', last_error = ?, locked_at = NULL WHERE id = ?`)
        .run(error, jobId);
    }
  }

  async releaseStale(lockedBefore: Date): Promise<number> {
    const result = this.db
      .prepare(`UPDATE evaluation_jobs SET status = 'queued', locked_at = NULL WHERE status = 'running' AND locked_at < ?`)
      .run(lockedBefore.toISOString());
    return Number(result.changes);
  }

  async pendingCount(): Promise<number> {
    const row = this.db
      .prepare(`SELECT COUNT(*) AS n FROM evaluation_jobs WHERE status IN ('queued', 'running')`)
      .get() as Row;
    return Number(row.n);
  }
}
