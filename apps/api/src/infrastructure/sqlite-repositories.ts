import type { EvaluationReport } from '@blueprint/shared';
import { Attempt, type AttemptSnapshot } from '../domain/attempt';
import type { AttemptRepository, EvaluationRepository, SubmissionRepository } from '../domain/ports';
import { Submission, type SubmissionSnapshot } from '../domain/submission';
import type { Database } from './database';

type Row = Record<string, unknown>;

export class SqliteAttemptRepository implements AttemptRepository {
  constructor(private readonly db: Database) {}

  async save(attempt: Attempt): Promise<void> {
    const s = attempt.toSnapshot();
    this.db
      .prepare(
        `INSERT INTO attempts (id, learner_id, problem_id, draft, revealed_hints, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET draft = excluded.draft, revealed_hints = excluded.revealed_hints, updated_at = excluded.updated_at`,
      )
      .run(s.id, s.learnerId, s.problemId, JSON.stringify(s.draft), JSON.stringify(s.revealedHintLevels), s.createdAt, s.updatedAt);
  }

  async findById(id: string): Promise<Attempt | undefined> {
    const row = this.db.prepare('SELECT * FROM attempts WHERE id = ?').get(id) as Row | undefined;
    return row ? toAttempt(row) : undefined;
  }

  async listByLearner(learnerId: string, problemId?: string): Promise<Attempt[]> {
    const rows = problemId
      ? this.db
          .prepare('SELECT * FROM attempts WHERE learner_id = ? AND problem_id = ? ORDER BY updated_at DESC')
          .all(learnerId, problemId)
      : this.db.prepare('SELECT * FROM attempts WHERE learner_id = ? ORDER BY updated_at DESC').all(learnerId);
    return (rows as Row[]).map(toAttempt);
  }
}

function toAttempt(row: Row): Attempt {
  const snapshot: AttemptSnapshot = {
    id: row.id as string,
    learnerId: row.learner_id as string,
    problemId: row.problem_id as string,
    draft: JSON.parse(row.draft as string),
    revealedHintLevels: JSON.parse(row.revealed_hints as string),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
  return Attempt.restore(snapshot);
}

export class SqliteSubmissionRepository implements SubmissionRepository {
  constructor(private readonly db: Database) {}

  async save(submission: Submission): Promise<void> {
    const s = submission.toSnapshot();
    this.db
      .prepare(
        `INSERT INTO submissions (id, attempt_id, learner_id, problem_id, version, format, draft, design, content_hash, hints_used, status, status_message, submitted_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET status = excluded.status, status_message = excluded.status_message, updated_at = excluded.updated_at`,
      )
      .run(
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
      );
  }

  async findById(id: string): Promise<Submission | undefined> {
    const row = this.db.prepare('SELECT * FROM submissions WHERE id = ?').get(id) as Row | undefined;
    return row ? toSubmission(row) : undefined;
  }

  async listByAttempt(attemptId: string): Promise<Submission[]> {
    const rows = this.db.prepare('SELECT * FROM submissions WHERE attempt_id = ? ORDER BY version ASC').all(attemptId);
    return (rows as Row[]).map(toSubmission);
  }

  async listByLearner(learnerId: string): Promise<Submission[]> {
    const rows = this.db
      .prepare('SELECT * FROM submissions WHERE learner_id = ? ORDER BY submitted_at DESC')
      .all(learnerId);
    return (rows as Row[]).map(toSubmission);
  }
}

function toSubmission(row: Row): Submission {
  const snapshot: SubmissionSnapshot = {
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
  };
  return Submission.restore(snapshot);
}

export class SqliteEvaluationRepository implements EvaluationRepository {
  constructor(private readonly db: Database) {}

  /** One report per submission; a re-evaluation replaces the previous report. */
  async save(report: EvaluationReport): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO evaluations (id, submission_id, report, created_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(submission_id) DO UPDATE SET id = excluded.id, report = excluded.report, created_at = excluded.created_at`,
      )
      .run(report.id, report.submissionId, JSON.stringify(report), report.createdAt);
  }

  async findBySubmission(submissionId: string): Promise<EvaluationReport | undefined> {
    const row = this.db.prepare('SELECT report FROM evaluations WHERE submission_id = ?').get(submissionId) as
      | Row
      | undefined;
    return row ? (JSON.parse(row.report as string) as EvaluationReport) : undefined;
  }

  async findBySubmissions(submissionIds: string[]): Promise<Map<string, EvaluationReport>> {
    const result = new Map<string, EvaluationReport>();
    if (submissionIds.length === 0) return result;
    // Chunk to stay well below SQLite's bound-parameter limit.
    for (let i = 0; i < submissionIds.length; i += 500) {
      const chunk = submissionIds.slice(i, i + 500);
      const rows = this.db
        .prepare(`SELECT submission_id, report FROM evaluations WHERE submission_id IN (${chunk.map(() => '?').join(',')})`)
        .all(...chunk) as Row[];
      for (const row of rows) result.set(row.submission_id as string, JSON.parse(row.report as string));
    }
    return result;
  }
}
