import { describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../../src/config';
import { GroqLlmClient } from '../../src/evaluation/llm/groq-client';
import type { LlmRequest } from '../../src/evaluation/llm/llm-client';
import { PROBLEMS_DIR } from '../fixtures/harness';

const request = {
  system: 'You are a reviewer. Return JSON.',
  user: 'Review this design',
  jsonSchema: { type: 'object', required: ['summary'] },
  grounding: {},
} as unknown as LlmRequest;

function reply(status: number, body: unknown) {
  return vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
}

describe('GroqLlmClient', () => {
  it('sends a JSON-mode chat completion with the schema in the system prompt', async () => {
    const fetchImpl = reply(200, { model: 'llama-x', choices: [{ message: { content: '{"summary":"ok"}' }, finish_reason: 'stop' }] });
    const client = new GroqLlmClient({ apiKey: 'k', model: 'llama-x', fetchImpl });
    await expect(client.complete(request)).resolves.toEqual({ text: '{"summary":"ok"}', model: 'llama-x' });

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(init.headers.authorization).toBe('Bearer k');
    const body = JSON.parse(init.body);
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.messages[0].content).toContain('"required":["summary"]');
    expect(body.messages[1]).toEqual({ role: 'user', content: 'Review this design' });
  });

  it('gives reasoning models the schema as a response format, an effort, and room to think', async () => {
    const fetchImpl = reply(200, { model: 'openai/gpt-oss-120b', choices: [{ message: { content: '{"summary":"ok"}' }, finish_reason: 'stop' }] });
    const client = new GroqLlmClient({ apiKey: 'k', model: 'openai/gpt-oss-120b', effort: 'high', fetchImpl });
    await expect(client.complete(request)).resolves.toEqual({ text: '{"summary":"ok"}', model: 'openai/gpt-oss-120b' });

    const body = JSON.parse(fetchImpl.mock.calls[0]![1].body);
    expect(body.response_format).toEqual({
      type: 'json_schema',
      json_schema: { name: 'design_review', schema: { type: 'object', required: ['summary'] }, strict: false },
    });
    expect(body).toMatchObject({ reasoning_effort: 'high', include_reasoning: false });
    expect(body.max_completion_tokens).toBeGreaterThan(4096);
  });

  it.each([
    [401, false, /API key/],
    [429, true, /rate limited/],
    [503, true, /503/],
    [400, false, /rejected the request: bad model/],
  ])('maps HTTP %i to a %s-retryable error', async (status, retryable, message) => {
    const client = new GroqLlmClient({ apiKey: 'k', model: 'm', fetchImpl: reply(status, { error: { message: 'bad model' } }) });
    await expect(client.complete(request)).rejects.toMatchObject({ retryable, message: expect.stringMatching(message) });
  });

  it('treats a truncated or empty completion as retryable', async () => {
    const truncated = new GroqLlmClient({ apiKey: 'k', model: 'm', fetchImpl: reply(200, { choices: [{ message: { content: '{"su' }, finish_reason: 'length' }] }) });
    await expect(truncated.complete(request)).rejects.toMatchObject({ retryable: true });
    const empty = new GroqLlmClient({ apiKey: 'k', model: 'm', fetchImpl: reply(200, { choices: [{ message: { content: '' } }] }) });
    await expect(empty.complete(request)).rejects.toMatchObject({ retryable: true });
  });

  it('treats network failures as retryable', async () => {
    const client = new GroqLlmClient({ apiKey: 'k', model: 'm', fetchImpl: vi.fn().mockRejectedValue(new TypeError('fetch failed')) });
    await expect(client.complete(request)).rejects.toMatchObject({ retryable: true });
  });
});

describe('provider selection', () => {
  it('picks Groq automatically when only GROQ_API_KEY is set, with a Groq default model', () => {
    const config = loadConfig({ PROBLEMS_DIR, GROQ_API_KEY: 'test-groq-key' });
    expect(config.llm).toMatchObject({ provider: 'groq', apiKey: 'test-groq-key', model: 'openai/gpt-oss-120b' });
  });

  it('prefers Anthropic when both keys are set, and the simulator when neither is', () => {
    expect(loadConfig({ PROBLEMS_DIR, GROQ_API_KEY: 'g', ANTHROPIC_API_KEY: 'a' }).llm.provider).toBe('anthropic');
    expect(loadConfig({ PROBLEMS_DIR }).llm.provider).toBe('simulated');
  });
});
