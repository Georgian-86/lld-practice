import type { CriterionId, Finding } from '@blueprint/shared';
import type { CriterionRating, EvaluationContext, Evaluator, EvaluatorOutput } from '../evaluator';
import { LlmError, type LlmClient } from './llm-client';
import { buildReviewPrompt, REVIEWER_SYSTEM_PROMPT } from './prompt-builder';
import { aiReviewJsonSchema, aiReviewSchema, type AiReview } from './review-schema';

/**
 * The LLM-backed evaluator. Owns prompting, output validation and guardrails;
 * the transport (Claude, simulator) and its resilience are injected.
 */
export class LlmDesignReviewer implements Evaluator {
  readonly id = 'ai-reviewer';
  readonly version = '1.0.0';
  readonly kind = 'llm' as const;

  constructor(private readonly client: LlmClient) {}

  async evaluate(context: EvaluationContext): Promise<EvaluatorOutput> {
    const baseUser = buildReviewPrompt(context.problem, context.design, context.priorFindings);
    const request = {
      system: REVIEWER_SYSTEM_PROMPT,
      user: baseUser,
      jsonSchema: aiReviewJsonSchema,
      grounding: { problem: context.problem, design: context.design, facts: context.priorFindings },
    };

    let response = await this.client.complete(request);
    let parsed = parseReview(response.text);
    if (!parsed.ok) {
      // One repair attempt: show the model its own validation error.
      response = await this.client.complete({
        ...request,
        user: `${baseUser}\n\nYour previous reply could not be used (${parsed.error}). Reply again with only the JSON object.`,
      });
      parsed = parseReview(response.text);
      if (!parsed.ok) throw new LlmError(`AI review was not in the expected format (${parsed.error}).`, false);
    }
    return this.applyGuardrails(parsed.review, context, response.model);
  }

  /** Keeps the AI honest: only real entity names, deduplicated, bounded. */
  private applyGuardrails(review: AiReview, context: EvaluationContext, model: string): EvaluatorOutput {
    const canonical = (name: string) => context.index.find(name)?.name;
    const seen = new Set<string>();
    const findings: Finding[] = [];
    for (const f of review.findings) {
      const fingerprint = `ai:${f.criterionId}:${slug(f.title)}`;
      if (seen.has(fingerprint)) continue;
      seen.add(fingerprint);
      const entities = [...new Set(f.entities.map(canonical).filter((n): n is string => Boolean(n)))];
      findings.push({
        fingerprint,
        criterionId: f.criterionId,
        kind: f.kind,
        // Strengths are never "critical"; normalise so the UI stays consistent.
        severity: f.kind === 'strength' ? 'info' : f.severity,
        title: f.title.trim(),
        message: f.message.trim(),
        ...(f.suggestion.trim() ? { suggestion: f.suggestion.trim() } : {}),
        evidence: entities.length ? { entities } : {},
        source: 'ai',
      });
    }
    const ratings: Partial<Record<CriterionId, CriterionRating>> = {};
    for (const c of review.criteria) ratings[c.criterionId] = { rating: c.rating, rationale: c.rationale.trim() };
    return {
      findings: findings.slice(0, 8),
      ratings,
      summary: review.summary.trim(),
      alternatives: review.alternatives.filter((a) => a.title.trim()).slice(0, 3),
      nextStep: review.nextStep.trim() || undefined,
      detail: model === 'simulated' ? 'simulated reviewer (no API key configured)' : model,
    };
  }
}

type ParseOutcome = { ok: true; review: AiReview } | { ok: false; error: string };

export function parseReview(text: string): ParseOutcome {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/, '')
    .trim();
  let json: unknown;
  try {
    json = JSON.parse(trimmed);
  } catch {
    return { ok: false, error: 'response was not valid JSON' };
  }
  const result = aiReviewSchema.safeParse(json);
  if (!result.success) {
    const issue = result.error.issues[0];
    return { ok: false, error: `${issue?.path.join('.') || 'root'}: ${issue?.message ?? 'invalid'}` };
  }
  return { ok: true, review: result.data };
}

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}
