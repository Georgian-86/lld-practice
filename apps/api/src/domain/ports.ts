import type { EvaluationReport, Problem } from '@blueprint/shared';
import type { Attempt } from './attempt';
import type { Submission } from './submission';

/**
 * Ports: what the application layer needs from the outside world. Concrete
 * adapters (SQLite, the file-based catalogue, system clock) live in
 * `infrastructure/` and are wired together in `container.ts`.
 */

export interface ProblemCatalog {
  list(): Problem[];
  get(id: string): Problem | undefined;
}

export interface AttemptRepository {
  save(attempt: Attempt): Promise<void>;
  findById(id: string): Promise<Attempt | undefined>;
  listByLearner(learnerId: string, problemId?: string): Promise<Attempt[]>;
}

export interface SubmissionRepository {
  save(submission: Submission): Promise<void>;
  findById(id: string): Promise<Submission | undefined>;
  listByAttempt(attemptId: string): Promise<Submission[]>;
  listByLearner(learnerId: string): Promise<Submission[]>;
}

export interface EvaluationRepository {
  save(report: EvaluationReport): Promise<void>;
  findBySubmission(submissionId: string): Promise<EvaluationReport | undefined>;
  findBySubmissions(submissionIds: string[]): Promise<Map<string, EvaluationReport>>;
}

export interface EvaluationJob {
  id: string;
  submissionId: string;
  attempts: number;
  maxAttempts: number;
}

export interface JobQueue {
  enqueue(submissionId: string, options?: { maxAttempts?: number }): Promise<EvaluationJob>;
  /** Atomically claims the next due job, or returns null. */
  claimNext(now: Date): Promise<EvaluationJob | null>;
  complete(jobId: string): Promise<void>;
  /** Re-schedules the job at `retryAt`, or marks it dead when `retryAt` is null. */
  fail(jobId: string, error: string, retryAt: Date | null): Promise<void>;
  /** Releases jobs whose worker died mid-run. Returns how many were released. */
  releaseStale(lockedBefore: Date): Promise<number>;
  pendingCount(): Promise<number>;
}

export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  next(prefix: string): string;
}
