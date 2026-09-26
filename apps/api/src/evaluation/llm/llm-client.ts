import type { DesignModel, Finding, Problem } from '@blueprint/shared';

export interface LlmRequest {
  system: string;
  user: string;
  /** JSON Schema the response must satisfy (used for structured outputs). */
  jsonSchema: Record<string, unknown>;
  /**
   * The structured inputs the prompt was built from. Real providers ignore it;
   * the offline simulator and the cache key use it.
   */
  grounding: { problem: Problem; design: DesignModel; facts: Finding[] };
}

export interface LlmResponse {
  text: string;
  model: string;
}

/** Port for any text-generation backend. Decorators add timeout, retry and caching. */
export interface LlmClient {
  readonly name: string;
  complete(request: LlmRequest, signal?: AbortSignal): Promise<LlmResponse>;
}

export class LlmError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    override readonly cause?: unknown,
    /** How long the provider asked us to wait before trying again (rate limits). */
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'LlmError';
  }
}
