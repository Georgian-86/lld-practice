import { LlmError, type LlmClient, type LlmRequest, type LlmResponse } from './llm-client';

export interface GroqClientOptions {
  apiKey: string;
  model: string;
  /** Reasoning effort for reasoning models (gpt-oss); ignored for others. */
  effort?: 'low' | 'medium' | 'high';
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

interface ChatCompletion {
  model?: string;
  choices?: { message?: { content?: string | null }; finish_reason?: string }[];
  error?: { message?: string; code?: string };
}

/** Groq models that accept a JSON Schema response format and reasoning controls. */
const REASONING_MODEL = /^openai\/gpt-oss-/;

/**
 * Groq adapter (OpenAI-compatible chat completions). Reasoning models (gpt-oss)
 * get the review schema as a best-effort `json_schema` response format and a
 * reasoning effort, with the reasoning kept out of the reply; other models use
 * JSON mode. Either way the schema is also in the prompt, and the reviewer's Zod
 * validation + repair retry enforces it. Retries and timeouts are applied by the
 * decorators, not here.
 */
export class GroqLlmClient implements LlmClient {
  readonly name: string;
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;

  constructor(private readonly options: GroqClientOptions) {
    this.name = `groq:${options.model}`;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.baseUrl = options.baseUrl ?? 'https://api.groq.com/openai/v1';
  }

  async complete(request: LlmRequest, signal?: AbortSignal): Promise<LlmResponse> {
    const system = `${request.system}\n\nRespond with a single JSON object that conforms to this JSON Schema (no prose, no code fences):\n${JSON.stringify(request.jsonSchema)}`;
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { authorization: `Bearer ${this.options.apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify(this.body(system, request)),
        signal,
      });
    } catch (error) {
      if (signal?.aborted) throw new LlmError('The AI review was cancelled.', true, error);
      throw new LlmError('Could not reach the AI reviewer (Groq).', true, error);
    }

    let body: ChatCompletion | null = null;
    try {
      body = (await response.json()) as ChatCompletion;
    } catch {
      /* non-JSON error page */
    }

    if (!response.ok) {
      const detail = body?.error?.message ?? `HTTP ${response.status}`;
      if (response.status === 401 || response.status === 403) {
        throw new LlmError('The AI reviewer is not configured correctly (Groq rejected the API key).', false);
      }
      if (response.status === 429) throw new LlmError('The AI reviewer is busy (rate limited).', true);
      if (response.status >= 500) throw new LlmError(`AI reviewer error (${response.status}).`, true);
      throw new LlmError(`The AI reviewer rejected the request: ${detail}`, false);
    }

    const choice = body?.choices?.[0];
    const text = choice?.message?.content ?? '';
    if (choice?.finish_reason === 'length') throw new LlmError('The AI review was cut off before it finished.', true);
    if (!text.trim()) throw new LlmError('The AI reviewer returned an empty response.', true);
    return { text, model: body?.model ?? this.options.model };
  }

  private body(system: string, request: LlmRequest) {
    const messages = [
      { role: 'system', content: system },
      { role: 'user', content: request.user },
    ];
    if (!REASONING_MODEL.test(this.options.model)) {
      return { model: this.options.model, messages, temperature: 0.2, max_completion_tokens: 4096, response_format: { type: 'json_object' } };
    }
    return {
      model: this.options.model,
      messages,
      temperature: 0.2,
      // Reasoning tokens share this budget, so leave room for them and the review.
      max_completion_tokens: 12_000,
      reasoning_effort: this.options.effort ?? 'medium',
      include_reasoning: false,
      response_format: { type: 'json_schema', json_schema: { name: 'design_review', schema: request.jsonSchema, strict: false } },
    };
  }
}
