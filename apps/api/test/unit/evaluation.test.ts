import { describe, expect, it, vi } from 'vitest';
import type { Finding } from '@blueprint/shared';
import { DesignIndex } from '../../src/evaluation/design-index';
import { CachingLlmClient, RetryingLlmClient, TimeoutLlmClient } from '../../src/evaluation/llm/decorators';
import { LlmError, type LlmClient, type LlmRequest } from '../../src/evaluation/llm/llm-client';
import { LlmDesignReviewer, parseReview } from '../../src/evaluation/llm/llm-reviewer';
import { simulateReview } from '../../src/evaluation/llm/simulated-client';
import { EvaluationPipeline } from '../../src/evaluation/pipeline';
import { RuleBasedEvaluator } from '../../src/evaluation/rule-based-evaluator';
import { defaultRules } from '../../src/evaluation/rules';
import { ScoreAggregator, SCORING } from '../../src/evaluation/score-aggregator';
import { diffFindings } from '../../src/evaluation/comparison';
import { goodParkingDesign } from '../fixtures/designs';
import { FakeClock, fakeLlm, problem, sequentialIds } from '../fixtures/harness';

const parking = problem('parking-lot');

function finding(partial: Partial<Finding>): Finding {
  return {
    fingerprint: partial.fingerprint ?? `x:${Math.random()}`,
    criterionId: 'requirements',
    kind: 'issue',
    severity: 'major',
    title: 't',
    message: 'm',
    evidence: {},
    source: 'rule',
    ...partial,
  };
}

describe('ScoreAggregator', () => {
  const aggregator = new ScoreAggregator();

  it('uses rule scores alone when there is no AI rating', () => {
    const card = aggregator.aggregate(parking, [finding({ severity: 'major' })], null);
    const requirements = card.criterionScores.find((c) => c.criterionId === 'requirements')!;
    expect(requirements.score).toBe(80);
    expect(requirements.aiScore).toBeNull();
  });

  it('weights the overall score by the problem rubric', () => {
    const card = aggregator.aggregate(parking, [finding({ criterionId: 'tradeoffs', severity: 'critical' })], null);
    // tradeoffs: 100-45 = 55 capped at 50, weight 10 of 100; all others 100.
    expect(card.overallScore).toBe(Math.round((90 * 100 + 10 * 50) / 100));
  });

  it('caps a criterion with a critical finding, whatever the AI says', () => {
    const card = aggregator.aggregate(parking, [finding({ severity: 'critical' })], {
      requirements: { rating: 5, rationale: 'great' },
    });
    expect(card.criterionScores[0]!.score).toBe(SCORING.criticalCap);
  });

  it('limits how far the AI can lift a score above the rule evidence', () => {
    const findings = [finding({}), finding({}), finding({})]; // rule score 40
    const card = aggregator.aggregate(parking, findings, { requirements: { rating: 5, rationale: 'r' } });
    expect(card.criterionScores[0]!.score).toBe(40 + SCORING.maxAiLift);
  });

  it('lets the AI lower a score freely', () => {
    const card = aggregator.aggregate(parking, [], { requirements: { rating: 1, rationale: 'r' } });
    expect(card.criterionScores[0]!.score).toBe(Math.round(0.4 * 100 + 0.6 * 20));
  });

  it('ignores strengths when deducting', () => {
    const card = aggregator.aggregate(parking, [finding({ kind: 'strength', severity: 'info' })], null);
    expect(card.criterionScores[0]!.score).toBe(100);
  });
});

describe('parseReview', () => {
  const valid = simulateReview(parking, goodParkingDesign(), []);

  it('accepts valid JSON, including inside a code fence', () => {
    expect(parseReview(JSON.stringify(valid)).ok).toBe(true);
    expect(parseReview('```json\n' + JSON.stringify(valid) + '\n```').ok).toBe(true);
  });

  it('rejects non-JSON and schema violations with a reason', () => {
    expect(parseReview('Sure! Here is my review')).toEqual({ ok: false, error: 'response was not valid JSON' });
    const bad = parseReview(JSON.stringify({ ...valid, criteria: [{ criterionId: 'requirements', rating: 9, rationale: 'x' }] }));
    expect(bad.ok).toBe(false);
  });
});

describe('LlmDesignReviewer', () => {
  const context = () => {
    const design = goodParkingDesign();
    return { problem: parking, design, index: new DesignIndex(design), priorFindings: [] };
  };

  it('asks once more when the first reply is malformed, then succeeds', async () => {
    const good = JSON.stringify(simulateReview(parking, goodParkingDesign(), []));
    const complete = vi.fn().mockResolvedValueOnce({ text: 'not json', model: 'm' }).mockResolvedValueOnce({ text: good, model: 'm' });
    const output = await new LlmDesignReviewer({ name: 'x', complete }).evaluate(context());
    expect(complete).toHaveBeenCalledTimes(2);
    expect(complete.mock.calls[1]![0].user).toContain('could not be used');
    expect(output.ratings?.requirements).toBeDefined();
  });

  it('gives up (non-retryable) when the repair reply is also malformed', async () => {
    const client: LlmClient = { name: 'x', complete: async () => ({ text: '{}', model: 'm' }) };
    await expect(new LlmDesignReviewer(client).evaluate(context())).rejects.toMatchObject({ retryable: false });
  });

  it('drops references to classes that are not in the design', async () => {
    const review = simulateReview(parking, goodParkingDesign(), []);
    review.findings = [
      { criterionId: 'modelling', kind: 'issue', severity: 'major', title: 'Hallucination', message: 'm', suggestion: '', entities: ['ParkingLot', 'Spaceship', 'parkinglot'] },
    ];
    const client: LlmClient = { name: 'x', complete: async () => ({ text: JSON.stringify(review), model: 'm' }) };
    const output = await new LlmDesignReviewer(client).evaluate(context());
    expect(output.findings[0]!.evidence.entities).toEqual(['ParkingLot']);
    expect(output.findings[0]!.source).toBe('ai');
  });
});

describe('LLM decorators', () => {
  const request = { system: 's', user: 'u', jsonSchema: {}, grounding: {} } as unknown as LlmRequest;

  it('retries retryable errors with backoff and then succeeds', async () => {
    const complete = vi
      .fn()
      .mockRejectedValueOnce(new LlmError('busy', true))
      .mockResolvedValueOnce({ text: 'ok', model: 'm' });
    const sleep = vi.fn().mockResolvedValue(undefined);
    const client = new RetryingLlmClient({ name: 'x', complete }, { maxRetries: 2, baseDelayMs: 100, sleep });
    await expect(client.complete(request)).resolves.toEqual({ text: 'ok', model: 'm' });
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('does not retry non-retryable errors', async () => {
    const complete = vi.fn().mockRejectedValue(new LlmError('bad key', false));
    const client = new RetryingLlmClient({ name: 'x', complete }, { maxRetries: 3, baseDelayMs: 1, sleep: async () => {} });
    await expect(client.complete(request)).rejects.toThrow('bad key');
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('stops after maxRetries', async () => {
    const complete = vi.fn().mockRejectedValue(new LlmError('busy', true));
    const client = new RetryingLlmClient({ name: 'x', complete }, { maxRetries: 2, baseDelayMs: 1, sleep: async () => {} });
    await expect(client.complete(request)).rejects.toThrow('busy');
    expect(complete).toHaveBeenCalledTimes(3);
  });

  it('times out slow calls with a retryable error', async () => {
    const slow: LlmClient = { name: 'slow', complete: () => new Promise((r) => setTimeout(() => r({ text: '', model: '' }), 1000)) };
    await expect(new TimeoutLlmClient(slow, 20).complete(request)).rejects.toMatchObject({ retryable: true });
  });

  it('caches identical prompts', async () => {
    const complete = vi.fn().mockResolvedValue({ text: 'ok', model: 'm' });
    const client = new CachingLlmClient({ name: 'x', complete });
    await client.complete(request);
    await client.complete(request);
    await client.complete({ ...request, user: 'different' });
    expect(complete).toHaveBeenCalledTimes(2);
  });
});

describe('EvaluationPipeline', () => {
  const pipeline = (ai: LlmClient | null) =>
    new EvaluationPipeline(
      [new RuleBasedEvaluator(defaultRules())],
      ai ? [new LlmDesignReviewer(ai)] : [],
      new ScoreAggregator(),
      new FakeClock(),
      sequentialIds(),
    );
  const input = { submissionId: 'sub_1', problem: parking, design: goodParkingDesign() };

  it('produces a complete report with rule and AI findings', async () => {
    const stages: string[] = [];
    const report = await pipeline(fakeLlm()).run(input, async (s) => void stages.push(s));
    expect(report.completeness).toBe('complete');
    expect(stages).toEqual(['rules', 'ai', 'scoring']);
    expect(report.criterionScores.every((c) => c.aiScore !== null)).toBe(true);
    expect(report.evaluators.map((e) => e.status)).toEqual(['ok', 'ok']);
  });

  it('degrades to a partial, rule-only report when the AI fails', async () => {
    const report = await pipeline(fakeLlm({ complete: async () => Promise.reject(new LlmError('down', true)) })).run(input);
    expect(report.completeness).toBe('partial');
    expect(report.findings.every((f) => f.source === 'rule')).toBe(true);
    expect(report.criterionScores.every((c) => c.aiScore === null)).toBe(true);
    expect(report.evaluators[1]).toMatchObject({ status: 'failed', error: 'down' });
    expect(report.summary).toMatch(/automated checks only/);
  });

  it('is complete (rule-only) when AI review is disabled', async () => {
    const report = await pipeline(null).run(input);
    expect(report.completeness).toBe('complete');
    expect(report.evaluators).toHaveLength(1);
  });

  it('orders issues before suggestions before strengths, most severe first', async () => {
    const d = goodParkingDesign();
    d.tradeOffs = [];
    d.requirementMap = {};
    const report = await pipeline(null).run({ ...input, design: d });
    const kinds = report.findings.map((f) => f.kind);
    expect(kinds.indexOf('strength')).toBeGreaterThan(kinds.lastIndexOf('issue'));
    expect(report.findings[0]!.severity).toBe('major');
  });
});

describe('diffFindings', () => {
  it('classifies resolved, introduced, persisting and new strengths by fingerprint', () => {
    const base = { findings: [finding({ fingerprint: 'a' }), finding({ fingerprint: 'b' })] } as never;
    const target = {
      findings: [finding({ fingerprint: 'b' }), finding({ fingerprint: 'c' }), finding({ fingerprint: 's', kind: 'strength' })],
    } as never;
    const diff = diffFindings(base, target);
    expect(diff.resolved.map((f) => f.fingerprint)).toEqual(['a']);
    expect(diff.persisting.map((f) => f.fingerprint)).toEqual(['b']);
    expect(diff.introduced.map((f) => f.fingerprint)).toEqual(['c']);
    expect(diff.newStrengths.map((f) => f.fingerprint)).toEqual(['s']);
  });
});
