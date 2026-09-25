import { PracticeService } from './application/practice-service';
import { EvaluationService } from './application/evaluation-service';
import { ProgressService } from './application/progress-service';
import type { AppConfig } from './config';
import type { Clock, IdGenerator, ProblemCatalog } from './domain/ports';
import type { Evaluator } from './evaluation/evaluator';
import { AnthropicLlmClient } from './evaluation/llm/anthropic-client';
import { CachingLlmClient, RetryingLlmClient, TimeoutLlmClient } from './evaluation/llm/decorators';
import type { LlmClient } from './evaluation/llm/llm-client';
import { LlmDesignReviewer } from './evaluation/llm/llm-reviewer';
import { SimulatedLlmClient } from './evaluation/llm/simulated-client';
import { EvaluationPipeline } from './evaluation/pipeline';
import { RuleBasedEvaluator } from './evaluation/rule-based-evaluator';
import { defaultRules } from './evaluation/rules';
import { ScoreAggregator } from './evaluation/score-aggregator';
import { SubmissionParserRegistry } from './formats/parsers';
import { openDatabase, type Database } from './infrastructure/database';
import { InMemoryProblemCatalog } from './infrastructure/problem-catalog';
import {
  SqliteAttemptRepository,
  SqliteEvaluationRepository,
  SqliteSubmissionRepository,
} from './infrastructure/sqlite-repositories';
import { SqliteJobQueue } from './infrastructure/sqlite-job-queue';
import { randomIds, systemClock } from './infrastructure/system';
import { EvaluationWorker, type WorkerLogger } from './worker/evaluation-worker';

export interface ContainerOverrides {
  db?: Database;
  clock?: Clock;
  ids?: IdGenerator;
  problems?: ProblemCatalog;
  /** Replace the LLM transport (tests inject fakes here). `null` disables AI review. */
  llmClient?: LlmClient | null;
  logger?: WorkerLogger;
}

export type Container = ReturnType<typeof createContainer>;

/** Composition root: the only place that knows concrete classes. */
export function createContainer(config: AppConfig, overrides: ContainerOverrides = {}) {
  const db = overrides.db ?? openDatabase(config.databasePath);
  const clock = overrides.clock ?? systemClock;
  const ids = overrides.ids ?? randomIds;
  const problems = overrides.problems ?? InMemoryProblemCatalog.fromDirectory(config.problemsDir);
  const logger: WorkerLogger = overrides.logger ?? { info() {}, warn() {}, error() {} };

  const attempts = new SqliteAttemptRepository(db);
  const submissions = new SqliteSubmissionRepository(db);
  const evaluations = new SqliteEvaluationRepository(db);
  const queue = new SqliteJobQueue(db, ids, clock);

  const llmClient = overrides.llmClient !== undefined ? overrides.llmClient : buildLlmClient(config);
  const aiEvaluators: Evaluator[] = llmClient ? [new LlmDesignReviewer(llmClient)] : [];
  const pipeline = new EvaluationPipeline(
    [new RuleBasedEvaluator(defaultRules())],
    aiEvaluators,
    new ScoreAggregator(),
    clock,
    ids,
  );

  const evaluationService = new EvaluationService({ problems, submissions, evaluations, pipeline, clock });
  const practice = new PracticeService({
    problems,
    attempts,
    submissions,
    evaluations,
    queue,
    parsers: SubmissionParserRegistry.withDefaults(),
    clock,
    ids,
    pollAfterMs: 1000,
  });
  const progress = new ProgressService({ problems, attempts, submissions, evaluations });
  const worker = new EvaluationWorker(queue, evaluationService, clock, config.worker, logger);

  return {
    db,
    problems,
    practice,
    progress,
    evaluationService,
    pipeline,
    worker,
    queue,
    aiReviewer: llmClient ? { name: llmClient.name } : null,
  };
}

function buildLlmClient(config: AppConfig): LlmClient | null {
  const { llm } = config;
  if (llm.provider === 'none') return null;
  const base: LlmClient =
    llm.provider === 'anthropic'
      ? new AnthropicLlmClient({ apiKey: llm.apiKey, model: llm.model, effort: llm.effort })
      : new SimulatedLlmClient({ latencyMs: llm.simulatedLatencyMs, failureRate: llm.simulatedFailureRate });
  // Order matters: cache hits skip everything; each retry gets its own timeout.
  return new CachingLlmClient(
    new RetryingLlmClient(new TimeoutLlmClient(base, llm.timeoutMs), { maxRetries: llm.maxRetries, baseDelayMs: 1000 }),
  );
}
