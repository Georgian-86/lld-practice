import { join } from 'node:path';
import { PracticeService } from './application/practice-service';
import { EvaluationService } from './application/evaluation-service';
import { CurveballService } from './application/curveball-service';
import { LintService } from './application/lint-service';
import { ProgressService } from './application/progress-service';
import type { AppConfig } from './config';
import type { Clock, IdGenerator, ProblemCatalog } from './domain/ports';
import type { Evaluator } from './evaluation/evaluator';
import { AnthropicLlmClient } from './evaluation/llm/anthropic-client';
import { GroqLlmClient } from './evaluation/llm/groq-client';
import { CachingLlmClient, RetryingLlmClient, TimeoutLlmClient } from './evaluation/llm/decorators';
import type { LlmClient } from './evaluation/llm/llm-client';
import { LlmDesignReviewer } from './evaluation/llm/llm-reviewer';
import { SimulatedLlmClient } from './evaluation/llm/simulated-client';
import { EvaluationPipeline } from './evaluation/pipeline';
import { RuleBasedEvaluator } from './evaluation/rule-based-evaluator';
import { defaultRules } from './evaluation/rules';
import { ScoreAggregator } from './evaluation/score-aggregator';
import { SubmissionParserRegistry } from './formats/parsers';
import { InMemoryProblemCatalog } from './infrastructure/problem-catalog';
import { InMemorySampleDesigns } from './infrastructure/sample-catalog';
import { openSqliteStorage, type Storage } from './infrastructure/storage';
import { randomIds, systemClock } from './infrastructure/system';
import { EvaluationWorker, type WorkerLogger } from './worker/evaluation-worker';

export interface ContainerOverrides {
  /** Persistence (SQLite file by default; Postgres when DATABASE_URL is set, opened by the server). */
  storage?: Storage;
  clock?: Clock;
  ids?: IdGenerator;
  problems?: ProblemCatalog;
  /** Replace the LLM transport (tests inject fakes here). `null` disables AI review. */
  llmClient?: LlmClient | null;
  /** Model used to word adaptive curveballs; defaults to the reviewer's when it is a real provider. */
  curveballLlm?: LlmClient | null;
  logger?: WorkerLogger;
}

export type Container = ReturnType<typeof createContainer>;

/** Composition root: the only place that knows concrete classes. */
export function createContainer(config: AppConfig, overrides: ContainerOverrides = {}) {
  const clock = overrides.clock ?? systemClock;
  const ids = overrides.ids ?? randomIds;
  const storage = overrides.storage ?? openSqliteStorage(config.databasePath, ids, clock);
  const problems = overrides.problems ?? InMemoryProblemCatalog.fromDirectory(config.problemsDir);
  const samples = InMemorySampleDesigns.fromDirectory(join(config.problemsDir, 'samples'), problems.list().map((p) => p.id));
  const logger: WorkerLogger = overrides.logger ?? { info() {}, warn() {}, error() {} };

  const { attempts, submissions, evaluations, queue } = storage;

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
    samples,
  });
  const progress = new ProgressService({ problems, attempts, submissions, evaluations, samples });
  const lint = new LintService(problems, defaultRules());
  // The offline simulator only knows how to review, so curveballs fall back to the template there.
  const realProvider = config.llm.provider === 'anthropic' || config.llm.provider === 'groq';
  const curveballs = new CurveballService({
    problems,
    submissions,
    llm: overrides.curveballLlm !== undefined ? overrides.curveballLlm : realProvider ? llmClient : null,
  });
  const worker = new EvaluationWorker(queue, evaluationService, clock, config.worker, logger);

  return {
    storage,
    problems,
    practice,
    progress,
    lint,
    curveballs,
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
  if (llm.provider === 'groq' && !llm.apiKey) throw new Error('LLM_PROVIDER=groq requires GROQ_API_KEY.');
  const base: LlmClient =
    llm.provider === 'anthropic'
      ? new AnthropicLlmClient({ apiKey: llm.apiKey, model: llm.model, effort: llm.effort })
      : llm.provider === 'groq'
        ? new GroqLlmClient({ apiKey: llm.apiKey!, model: llm.model, effort: llm.effort })
        : new SimulatedLlmClient({ latencyMs: llm.simulatedLatencyMs, failureRate: llm.simulatedFailureRate });
  // Order matters: cache hits skip everything; each retry gets its own timeout.
  return new CachingLlmClient(
    new RetryingLlmClient(new TimeoutLlmClient(base, llm.timeoutMs), { maxRetries: llm.maxRetries, baseDelayMs: 1000 }),
  );
}
