import { resolve } from 'node:path';
import type { Draft, DesignModel } from '@blueprint/shared';
import { loadConfig } from '../../src/config';
import { createContainer, type Container } from '../../src/container';
import type { Clock, IdGenerator } from '../../src/domain/ports';
import type { LlmClient } from '../../src/evaluation/llm/llm-client';
import { simulateReview } from '../../src/evaluation/llm/simulated-client';
import { buildApp } from '../../src/http/app';
import { openDatabase } from '../../src/infrastructure/database';
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

export async function createTestApp(options: { llm?: LlmClient | null } = {}) {
  const config = loadConfig({ NODE_ENV: 'test', PROBLEMS_DIR, LLM_PROVIDER: 'none' });
  const clock = new FakeClock();
  const container: Container = createContainer(
    { ...config, worker: { ...config.worker, retryBaseMs: 0 } },
    {
      db: openDatabase(':memory:'),
      clock,
      ids: sequentialIds(),
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
