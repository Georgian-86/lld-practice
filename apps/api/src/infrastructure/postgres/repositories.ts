import type { EvaluationReport } from '@blueprint/shared';
import { Attempt } from '../../domain/attempt';
import type { AttemptRepository, Clock, EvaluationJob, EvaluationRepository, IdGenerator, JobQueue, SubmissionRepository } from '../../domain/ports';
import { Submission, type SubmissionSnapshot } from '../../domain/submission';
import type { Row, SqlClient } from './sql-client';

export class PostgresAttemptRepository implements AttemptRepository {
  constructor(private readonly db: SqlClient) {}

  async save(attempt: Attempt): Promise<void> {
    const s = attempt.toSnapshot();
    await this.db.query(
      `INSERT INTO attempts (id, learner_id, problem_id, draft, revealed_hints, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET draft = EXCLUDED.draft, revealed_hints = EXCLUDED.revealed_hints, updated_at = EXCLUDED.updated_at`,
      [s.id, s.learnerId, s.problemId, JSON.stringify(s.draft), JSON.stringify(s.revealedHintLevels), s.createdAt, s.updatedAt],
    );
  }

  async findById(id: string): Promise<Attempt | undefined> {
    const { rows } = await this.db.query('SELECT * FROM attempts WHERE id = $1', [id]);
    return rows[0] ? toAttempt(rows[0]) : undefined;
  }

  async listByLearner(learnerId: string, problemId?: string): Promise<Attempt[]> {
    const { rows } = problemId
      ? await this.db.query('SELECT * FROM attempts WHERE learner_id = $1 AND problem_id = $2 ORDER BY updated_at DESC', [learnerId, problemId])
      : await this.db.query('SELECT * FROM attempts WHERE learner_id = $1 ORDER BY updated_at DESC', [learnerId]);
    return rows.map(toAttempt);
  }
}

function toAttempt(row: Row): Attempt {
  return Attempt.restore({
    id: row.id as string,
    learnerId: row.learner_id as string,
    problemId: row.problem_id as string,
    draft: JSON.parse(row.draft as string),
    revealedHintLevels: JSON.parse(row.revealed_hints as string),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  });
}

export class PostgresSubmissionRepository implements SubmissionRepository {
  constructor(private readonly db: SqlClient) {}

  async save(submission: Submission): Promise<void> {
    const s = submission.toSnapshot();
    await this.db.query(
      `INSERT INTO submissions (id, attempt_id, learner_id, problem_id, version, format, draft, design, content_hash, hints_used, status, status_message, submitted_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, status_message = EXCLUDED.status_message, updated_at = EXCLUDED.updated_at`,
      [
        s.id,
        s.attemptId,
        s.learnerId,
        s.problemId,
        s.version,
        s.format,
        JSON.stringify(s.draft),
        JSON.stringify(s.design),
        s.contentHash,
        s.hintsUsed,
        s.status,
        s.statusMessage,
        s.submittedAt,
        s.updatedAt,
      ],
    );
  }

  async findById(id: string): Promise<Submission | undefined> {
    const { rows } = await this.db.query('SELECT * FROM submissions WHERE id = $1', [id]);
    return rows[0] ? toSubmission(rows[0]) : undefined;
  }

  async listByAttempt(attemptId: string): Promise<Submission[]> {
    const { rows } = await this.db.query('SELECT * FROM submissions WHERE attempt_id = $1 ORDER BY version ASC', [attemptId]);
    return rows.map(toSubmission);
  }

  async listByLearner(learnerId: string): Promise<Submission[]> {
    const { rows } = await this.db.query('SELECT * FROM submissions WHERE learner_id = $1 ORDER BY submitted_at DESC', [learnerId]);
    return rows.map(toSubmission);
  }
}

function toSubmission(row: Row): Submission {
  return Submission.restore({
    id: row.id as string,
    attemptId: row.attempt_id as string,
    learnerId: row.learner_id as string,
    problemId: row.problem_id as string,
    version: Number(row.version),
    format: row.format as SubmissionSnapshot['format'],
    draft: JSON.parse(row.draft as string),
    design: JSON.parse(row.design as string),
    contentHash: row.content_hash as string,
    hintsUsed: Number(row.hints_used),
    status: row.status as SubmissionSnapshot['status'],
    statusMessage: (row.status_message as string | null) ?? null,
    submittedAt: row.submitted_at as string,
    updatedAt: row.updated_at as string,
  });
}

export class PostgresEvaluationRepository implements EvaluationRepository {
  constructor(private readonly db: SqlClient) {}

  /** One report per submission; a re-evaluation replaces the previous report. */
  async save(report: EvaluationReport): Promise<void> {
    await this.db.query(
      `INSERT INTO evaluations (id, submission_id, report, created_at) VALUES ($1, $2, $3, $4)
       ON CONFLICT (submission_id) DO UPDATE SET id = EXCLUDED.id, report = EXCLUDED.report, created_at = EXCLUDED.created_at`,
      [report.id, report.submissionId, JSON.stringify(report), report.createdAt],
    );
  }

  async findBySubmission(submissionId: string): Promise<EvaluationReport | undefined> {
    const { rows } = await this.db.query('SELECT report FROM evaluations WHERE submission_id = $1', [submissionId]);
    return rows[0] ? (JSON.parse(rows[0].report as string) as EvaluationReport) : undefined;
  }

  async findBySubmissions(submissionIds: string[]): Promise<Map<string, EvaluationReport>> {
    const result = new Map<string, EvaluationReport>();
    if (submissionIds.length === 0) return result;
    const { rows } = await this.db.query('SELECT submission_id, report FROM evaluations WHERE submission_id = ANY($1)', [submissionIds]);
    for (const row of rows) result.set(row.submission_id as string, JSON.parse(row.report as string));
    return result;
  }
}

/**
 * The durable job queue on Postgres. Claiming uses FOR UPDATE SKIP LOCKED, so
 * several workers (or instances) can poll the same table without ever taking
 * the same job twice.
 */
export class PostgresJobQueue implements JobQueue {
  constructor(
    private readonly db: SqlClient,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async enqueue(submissionId: string, options: { maxAttempts?: number } = {}): Promise<EvaluationJob> {
    const id = this.ids.next('job');
    const now = this.clock.now().toISOString();
    const maxAttempts = options.maxAttempts ?? 3;
    await this.db.query(
      `INSERT INTO evaluation_jobs (id, submission_id, status, attempts, max_attempts, run_at, created_at)
       VALUES ($1, $2, 'queued', 0, $3, $4, $4)`,
      [id, submissionId, maxAttempts, now],
    );
    return { id, submissionId, attempts: 0, maxAttempts };
  }

  async claimNext(now: Date): Promise<EvaluationJob | null> {
    const { rows } = await this.db.query(
      `UPDATE evaluation_jobs
          SET status = 'running', attempts = attempts + 1, locked_at = $1
        WHERE id = (
          SELECT id FROM evaluation_jobs
           WHERE status = 'queued' AND run_at <= $1
           ORDER BY run_at
           LIMIT 1
           FOR UPDATE SKIP LOCKED)
      RETURNING id, submission_id, attempts, max_attempts`,
      [now.toISOString()],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id as string,
      submissionId: row.submission_id as string,
      attempts: Number(row.attempts),
      maxAttempts: Number(row.max_attempts),
    };
  }

  async complete(jobId: string): Promise<void> {
    await this.db.query(`UPDATE evaluation_jobs SET status = 'done', locked_at = NULL WHERE id = $1`, [jobId]);
  }

  async fail(jobId: string, error: string, retryAt: Date | null): Promise<void> {
    if (retryAt) {
      await this.db.query(`UPDATE evaluation_jobs SET status = 'queued', run_at = $1, last_error = $2, locked_at = NULL WHERE id = $3`, [
        retryAt.toISOString(),
        error,
        jobId,
      ]);
    } else {
      await this.db.query(`UPDATE evaluation_jobs SET status = 'dead', last_error = $1, locked_at = NULL WHERE id = $2`, [error, jobId]);
    }
  }

  async releaseStale(lockedBefore: Date): Promise<number> {
    const { rowCount } = await this.db.query(
      `UPDATE evaluation_jobs SET status = 'queued', locked_at = NULL WHERE status = 'running' AND locked_at < $1`,
      [lockedBefore.toISOString()],
    );
    return rowCount;
  }

  async pendingCount(): Promise<number> {
    const { rows } = await this.db.query(`SELECT COUNT(*) AS n FROM evaluation_jobs WHERE status IN ('queued', 'running')`);
    return Number(rows[0]!.n);
  }
}
