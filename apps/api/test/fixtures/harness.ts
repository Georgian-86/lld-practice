import { resolve } from 'node:path';
import type { Draft, DesignModel } from '@blueprint/shared';
import { loadConfig } from '../../src/config';
import { createContainer, type Container } from '../../src/container';
import type { Clock, IdGenerator } from '../../src/domain/ports';
import type { LlmClient } from '../../src/evaluation/llm/llm-client';
import { simulateReview } from '../../src/evaluation/llm/simulated-client';
import { buildApp } from '../../src/http/app';
import { openDatabase } from '../../src/infrastructure/database';
import { postgresStorage } from '../../src/infrastructure/postgres';
import { sqliteStorage, type Storage } from '../../src/infrastructure/storage';
import { pgliteClient } from './pglite';
import { InMemoryProblemCatalog } from '../../src/infrastructure/problem-catalog';

export const PROBLEMS_DIR = resolve(import.meta.dirname, '../../../../problems');
export const catalog = InMemoryProblemCatalog.fromDirectory(PROBLEMS_DIR);

export function problem(id = 'parking-lot') {
  const p = catalog.get(id);
  if (!p) throw new Error(`fixture problem ${id} missing`);
  return p;
}

export class FakeClock implements Clock {
  constructor(private current = new Date('2026-01-01T09:00:00Z')) {}
  now() {
    return new Date(this.current);
  }
  advance(ms: number) {
    this.current = new Date(this.current.getTime() + ms);
  }
}

export function sequentialIds(): IdGenerator {
  let n = 0;
  return { next: (prefix) => `${prefix}_${String(++n).padStart(4, '0')}` };
}

/** Deterministic LLM that answers with the simulator's review, instantly. */
export function fakeLlm(overrides: Partial<LlmClient> = {}): LlmClient {
  return {
    name: 'fake-llm',
    async complete(request) {
      const { problem, design, facts } = request.grounding;
      return { text: JSON.stringify(simulateReview(problem, design, facts)), model: 'fake-model' };
    },
    ...overrides,
  };
}

/**
 * Which persistence adapter the HTTP tests run on. `TEST_STORAGE=postgres`
 * runs the whole integration suite against real Postgres (PGlite); the
 * default is in-memory SQLite. CI runs both.
 */
export async function testStorage(ids: IdGenerator, clock: Clock): Promise<Storage> {
  return process.env.TEST_STORAGE === 'postgres'
    ? postgresStorage(pgliteClient(), ids, clock, 'pglite')
    : sqliteStorage(openDatabase(':memory:'), ids, clock);
}

export async function createTestApp(options: { llm?: LlmClient | null } = {}) {
  const config = loadConfig({ NODE_ENV: 'test', PROBLEMS_DIR, LLM_PROVIDER: 'none' });
  const clock = new FakeClock();
  const ids = sequentialIds();
  const container: Container = createContainer(
    { ...config, worker: { ...config.worker, retryBaseMs: 0 } },
    {
      storage: await testStorage(ids, clock),
      clock,
      ids,
      problems: catalog,
      llmClient: options.llm === undefined ? fakeLlm() : options.llm,
    },
  );
  const app = await buildApp(container);
  return { app, container, clock };
}

export const LEARNER = { 'x-learner-id': 'learner_test_0001' };
export const OTHER_LEARNER = { 'x-learner-id': 'learner_test_0002' };

export function structured(design: DesignModel): { draft: Draft } {
  return { draft: { format: 'structured', design } };
}
