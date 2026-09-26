import type { AttemptRepository, Clock, EvaluationRepository, IdGenerator, JobQueue, SubmissionRepository } from '../domain/ports';
import { openDatabase, type Database } from './database';
import { SqliteJobQueue } from './sqlite-job-queue';
import { SqliteAttemptRepository, SqliteEvaluationRepository, SqliteSubmissionRepository } from './sqlite-repositories';

/**
 * Everything persistent, behind the domain ports. Two adapters implement it:
 * SQLite (a local file; zero setup) and Postgres (e.g. Supabase; for hosts
 * without a persistent disk). The application layer never knows which.
 */
export interface Storage {
  readonly kind: 'sqlite' | 'postgres';
  /** Where the data lives, for the startup log (never includes credentials). */
  readonly location: string;
  readonly attempts: AttemptRepository;
  readonly submissions: SubmissionRepository;
  readonly evaluations: EvaluationRepository;
  readonly queue: JobQueue;
  close(): Promise<void>;
}

export function sqliteStorage(db: Database, ids: IdGenerator, clock: Clock, location = 'sqlite'): Storage {
  return {
    kind: 'sqlite',
    location,
    attempts: new SqliteAttemptRepository(db),
    submissions: new SqliteSubmissionRepository(db),
    evaluations: new SqliteEvaluationRepository(db),
    queue: new SqliteJobQueue(db, ids, clock),
    close: async () => db.close(),
  };
}

export function openSqliteStorage(path: string, ids: IdGenerator, clock: Clock): Storage {
  return sqliteStorage(openDatabase(path), ids, clock, `sqlite:${path}`);
}
