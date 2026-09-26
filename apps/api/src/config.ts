import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const here = dirname(fileURLToPath(import.meta.url));

/** Finds a directory by walking up from this file (works from src/ and dist/). */
function findUp(name: string): string | undefined {
  let dir = here;
  for (let i = 0; i < 6; i++) {
    const candidate = resolve(dir, name);
    if (existsSync(candidate)) return candidate;
    dir = dirname(dir);
  }
  return undefined;
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_PATH: z.string().optional(),
  /** Postgres connection string (e.g. Supabase). When set, it is used instead of the SQLite file. */
  DATABASE_URL: z.string().url().optional(),
  PROBLEMS_DIR: z.string().optional(),
  WEB_DIST_DIR: z.string().optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  /** auto = Claude if ANTHROPIC_API_KEY is set, else Groq if GROQ_API_KEY is set, else the offline simulator. */
  LLM_PROVIDER: z.enum(['auto', 'anthropic', 'groq', 'simulated', 'none']).default('auto'),
  ANTHROPIC_API_KEY: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  /** Defaults per provider: claude-opus-5 (Anthropic), openai/gpt-oss-120b (Groq). */
  LLM_MODEL: z.string().optional(),
  LLM_EFFORT: z.enum(['low', 'medium', 'high']).default('medium'),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(90_000),
  LLM_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
  LLM_SIMULATED_LATENCY_MS: z.coerce.number().int().min(0).default(2500),
  LLM_SIMULATED_FAILURE_RATE: z.coerce.number().min(0).max(1).default(0),

  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(2),
  WORKER_POLL_MS: z.coerce.number().int().positive().default(500),
});

export type AppConfig = ReturnType<typeof loadConfig>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = envSchema.parse(env);
  const problemsDir = parsed.PROBLEMS_DIR ?? findUp('problems');
  if (!problemsDir) throw new Error('Could not find the problems directory. Set PROBLEMS_DIR.');
  let provider = parsed.LLM_PROVIDER;
  if (provider === 'auto') {
    provider = parsed.ANTHROPIC_API_KEY ? 'anthropic' : parsed.GROQ_API_KEY ? 'groq' : 'simulated';
  }
  const defaultModel = provider === 'groq' ? 'openai/gpt-oss-120b' : 'claude-opus-5';

  return {
    env: parsed.NODE_ENV,
    port: parsed.PORT,
    host: parsed.HOST,
    databaseUrl: parsed.DATABASE_URL,
    databasePath: parsed.DATABASE_PATH ?? resolve(findUp('apps') ?? here, '..', 'data', 'blueprint.db'),
    problemsDir,
    webDistDir: parsed.WEB_DIST_DIR ?? findUp('apps/web/dist'),
    logLevel: parsed.LOG_LEVEL,
    llm: {
      provider: provider as 'anthropic' | 'groq' | 'simulated' | 'none',
      apiKey: provider === 'groq' ? parsed.GROQ_API_KEY : parsed.ANTHROPIC_API_KEY,
      model: parsed.LLM_MODEL ?? defaultModel,
      effort: parsed.LLM_EFFORT,
      timeoutMs: parsed.LLM_TIMEOUT_MS,
      maxRetries: parsed.LLM_MAX_RETRIES,
      simulatedLatencyMs: parsed.LLM_SIMULATED_LATENCY_MS,
      simulatedFailureRate: parsed.LLM_SIMULATED_FAILURE_RATE,
    },
    worker: {
      concurrency: parsed.WORKER_CONCURRENCY,
      pollIntervalMs: parsed.WORKER_POLL_MS,
      retryBaseMs: 2_000,
      staleAfterMs: 5 * 60_000,
    },
  };
}
