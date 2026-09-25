import { LlmError, type LlmClient, type LlmRequest, type LlmResponse } from './llm-client';

export interface GroqClientOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

interface ChatCompletion {
  model?: string;
  choices?: { message?: { content?: string | null }; finish_reason?: string }[];
  error?: { message?: string; code?: string };
}

/**
 * Groq adapter (OpenAI-compatible chat completions). JSON mode guarantees
 * syntactically valid JSON; the schema itself is given in the prompt and
 * enforced afterwards by the reviewer's Zod validation + repair retry.
 * Retries and timeouts are applied by the decorators, not here.
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
        body: JSON.stringify({
          model: this.options.model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: request.user },
          ],
          temperature: 0.2,
          max_completion_tokens: 4096,
          response_format: { type: 'json_object' },
        }),
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
}
