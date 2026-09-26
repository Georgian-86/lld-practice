import type { Clock, IdGenerator } from '../../domain/ports';
import type { Storage } from '../storage';
import { PostgresAttemptRepository, PostgresEvaluationRepository, PostgresJobQueue, PostgresSubmissionRepository } from './repositories';
import { migrate } from './schema';
import { describeConnection, poolClient, type SqlClient } from './sql-client';

/** Storage on any SqlClient (a real pool in production, PGlite in tests). Creates the tables if needed. */
export async function postgresStorage(client: SqlClient, ids: IdGenerator, clock: Clock, location = 'postgres'): Promise<Storage> {
  await migrate(client);
  return {
    kind: 'postgres',
    location,
    attempts: new PostgresAttemptRepository(client),
    submissions: new PostgresSubmissionRepository(client),
    evaluations: new PostgresEvaluationRepository(client),
    queue: new PostgresJobQueue(client, ids, clock),
    close: () => client.end(),
  };
}

export function openPostgresStorage(connectionString: string, ids: IdGenerator, clock: Clock): Promise<Storage> {
  return postgresStorage(poolClient(connectionString), ids, clock, describeConnection(connectionString));
}
