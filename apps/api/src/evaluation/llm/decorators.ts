import { createHash } from 'node:crypto';
import { LlmError, type LlmClient, type LlmRequest, type LlmResponse } from './llm-client';

/** Fails the call if the inner client does not answer within `timeoutMs`. */
export class TimeoutLlmClient implements LlmClient {
  constructor(
    private readonly inner: LlmClient,
    private readonly timeoutMs: number,
  ) {}

  get name() {
    return this.inner.name;
  }

  async complete(request: LlmRequest, signal?: AbortSignal): Promise<LlmResponse> {
    const controller = new AbortController();
    const onAbort = () => controller.abort(signal?.reason);
    signal?.addEventListener('abort', onAbort, { once: true });
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new LlmError(`AI review timed out after ${Math.round(this.timeoutMs / 1000)}s.`, true));
      }, this.timeoutMs);
    });
    try {
      return await Promise.race([this.inner.complete(request, controller.signal), timeout]);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }
}

export interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  sleep?: (ms: number) => Promise<void>;
}

/** Retries retryable failures with exponential backoff and jitter. */
export class RetryingLlmClient implements LlmClient {
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(
    private readonly inner: LlmClient,
    private readonly options: RetryOptions,
  ) {
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  get name() {
    return this.inner.name;
  }

  async complete(request: LlmRequest, signal?: AbortSignal): Promise<LlmResponse> {
    let attempt = 0;
    for (;;) {
      try {
        return await this.inner.complete(request, signal);
      } catch (error) {
        const retryable = error instanceof LlmError && error.retryable;
        if (!retryable || attempt >= this.options.maxRetries || signal?.aborted) throw error;
        const delay = this.options.baseDelayMs * 2 ** attempt * (0.75 + Math.random() * 0.5);
        attempt++;
        await this.sleep(delay);
      }
    }
  }
}

/**
 * Identical submissions get identical reviews (and cost nothing twice).
 * In-memory LRU; a shared cache would replace this in a multi-instance setup.
 */
export class CachingLlmClient implements LlmClient {
  private readonly cache = new Map<string, LlmResponse>();

  constructor(
    private readonly inner: LlmClient,
    private readonly maxEntries = 200,
  ) {}

  get name() {
    return this.inner.name;
  }

  async complete(request: LlmRequest, signal?: AbortSignal): Promise<LlmResponse> {
    const key = createHash('sha256').update(`${this.inner.name}\n${request.system}\n${request.user}`).digest('hex');
    const hit = this.cache.get(key);
    if (hit) {
      this.cache.delete(key);
      this.cache.set(key, hit);
      return hit;
    }
    const response = await this.inner.complete(request, signal);
    this.cache.set(key, response);
    if (this.cache.size > this.maxEntries) this.cache.delete(this.cache.keys().next().value!);
    return response;
  }
}
