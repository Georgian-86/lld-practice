import Anthropic from '@anthropic-ai/sdk';
import { LlmError, type LlmClient, type LlmRequest, type LlmResponse } from './llm-client';

export interface AnthropicClientOptions {
  apiKey?: string;
  model: string;
  effort: 'low' | 'medium' | 'high';
  maxTokens?: number;
}

/**
 * Claude adapter. Uses structured outputs so the response is schema-shaped
 * JSON, adaptive thinking for review quality, and server-side refusal
 * fallbacks. Retries/timeouts are handled by decorators, so the SDK's own
 * retries are disabled to keep one retry policy in one place.
 */
export class AnthropicLlmClient implements LlmClient {
  readonly name: string;
  private readonly client: Anthropic;

  constructor(private readonly options: AnthropicClientOptions) {
    this.name = `anthropic:${options.model}`;
    this.client = new Anthropic({ apiKey: options.apiKey, maxRetries: 0 });
  }

  async complete(request: LlmRequest, signal?: AbortSignal): Promise<LlmResponse> {
    try {
      const params = {
        model: this.options.model,
        max_tokens: this.options.maxTokens ?? 16000,
        system: request.system,
        messages: [{ role: 'user' as const, content: request.user }],
        thinking: { type: 'adaptive' as const },
        output_config: {
          effort: this.options.effort,
          format: { type: 'json_schema' as const, schema: request.jsonSchema },
        },
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      };
      // `fallbacks: "default"` is newer than the SDK typings; the API accepts it with the beta header.
      const response = (await this.client.beta.messages.create(params as never, { signal })) as Anthropic.Beta.BetaMessage;

      if (response.stop_reason === 'refusal') {
        throw new LlmError('The AI reviewer declined to review this submission.', false);
      }
      if (response.stop_reason === 'max_tokens') {
        throw new LlmError('The AI review was cut off before it finished.', true);
      }
      const text = response.content
        .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('');
      if (!text.trim()) throw new LlmError('The AI reviewer returned an empty response.', true);
      return { text, model: response.model };
    } catch (error) {
      if (error instanceof LlmError) throw error;
      if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
        throw new LlmError('The AI reviewer is not configured correctly (authentication failed).', false, error);
      }
      if (error instanceof Anthropic.BadRequestError || error instanceof Anthropic.NotFoundError) {
        throw new LlmError(`The AI reviewer rejected the request: ${error.message}`, false, error);
      }
      if (error instanceof Anthropic.RateLimitError) {
        throw new LlmError('The AI reviewer is busy (rate limited).', true, error);
      }
      if (error instanceof Anthropic.APIConnectionError || error instanceof Anthropic.InternalServerError) {
        throw new LlmError('Could not reach the AI reviewer.', true, error);
      }
      if (error instanceof Anthropic.APIError) {
        throw new LlmError(`AI reviewer error (${error.status ?? 'unknown'}).`, (error.status ?? 500) >= 500, error);
      }
      throw new LlmError('Unexpected error while calling the AI reviewer.', true, error);
    }
  }
}
