import type { AdaptiveCurveballDTO, DesignModel, Problem } from '@blueprint/shared';
import { z } from 'zod';
import { NotFoundError } from '../domain/errors';
import type { ProblemCatalog, SubmissionRepository } from '../domain/ports';
import { DesignIndex } from '../evaluation/design-index';
import type { LlmClient } from '../evaluation/llm/llm-client';
import { mentionsAny } from '../evaluation/text';

type Target = AdaptiveCurveballDTO['target'];

/**
 * Picks the point of change the design is least ready for: first one with no
 * abstraction at all, then an abstraction with no implementations, and only
 * then one that is already covered (the one with the fewest variants).
 * Uses the same keyword matching as the scoring rule, so it agrees with the
 * report.
 */
export function pickTarget(problem: Problem, design: DesignModel): Target {
  const index = new DesignIndex(design);
  const ranked = problem.variationPoints.map((point, order) => {
    const related = index.entities.filter((e) => mentionsAny(e.name, point.keywords).length > 0);
    const abstraction = related.find((e) => index.isAbstraction(e));
    const implementations = abstraction ? index.implementorsOf(abstraction.name).length : 0;
    const status: Target['status'] = !abstraction ? 'missing' : implementations === 0 ? 'no-implementations' : 'covered';
    const heldBy = (abstraction ?? related[0])?.name.trim() ?? null;
    const rank = { missing: 0, 'no-implementations': 1, covered: 2 }[status] * 100 + implementations * 10 + order;
    return { rank, target: { variationPointId: point.id, name: point.name, status, heldBy } };
  });
  return ranked.sort((a, b) => a.rank - b.rank)[0]!.target;
}

/** Deterministic wording, used offline and whenever the AI's answer is unusable. */
export function templateCurveball(problem: Problem, target: Target): { title: string; prompt: string } {
  const point = problem.variationPoints.find((v) => v.id === target.variationPointId)!;
  const detail = point.description.trim().replace(/\.$/, '');
  const where =
    target.status === 'missing' && target.heldBy
      ? ` Today that logic lives inside ${target.heldBy}.`
      : target.status === 'no-implementations' && target.heldBy
        ? ` You drew ${target.heldBy} for this, but nothing implements it yet.`
        : '';
  return {
    title: `A new ${point.name.toLowerCase()}`,
    prompt: `${detail}. The business has just asked for one more ${point.name.toLowerCase()} variant, and more will follow.${where} Add it. Which classes change, which are added, and which stay untouched?`,
  };
}

const wordingSchema = z.object({ title: z.string().min(3).max(80), prompt: z.string().min(40).max(600) });

export class CurveballService {
  constructor(
    private readonly deps: {
      problems: ProblemCatalog;
      submissions: SubmissionRepository;
      /** A real model to word the curveball; null offline (the template is used). */
      llm: LlmClient | null;
    },
  ) {}

  async adaptive(learnerId: string, submissionId: string): Promise<AdaptiveCurveballDTO> {
    const submission = await this.deps.submissions.findById(submissionId);
    if (!submission || submission.learnerId !== learnerId) throw new NotFoundError('Submission', submissionId);
    const problem = this.deps.problems.get(submission.problemId);
    if (!problem) throw new NotFoundError('Problem', submission.problemId);
    const design = submission.toSnapshot().design;

    const target = pickTarget(problem, design);
    const fallback = templateCurveball(problem, target);
    const worded = this.deps.llm ? await this.word(problem, design, target, fallback).catch(() => null) : null;
    return {
      id: 'adaptive',
      ...(worded ?? fallback),
      variationPoints: [target.variationPointId],
      target,
      wordedBy: worded ? 'ai' : 'template',
    };
  }

  /** Asks the model for interviewer-style wording; returns null if the answer doesn't validate. */
  private async word(problem: Problem, design: DesignModel, target: Target, fallback: { title: string; prompt: string }) {
    const point = problem.variationPoints.find((v) => v.id === target.variationPointId)!;
    const response = await this.deps.llm!.complete(
      {
        system:
          'You are a senior engineer running a low-level design interview. Write one realistic change request ("curveball") that forces the candidate to extend their design at a specific point of change. Be concrete and domain-specific, two or three sentences, and end by asking which classes change and which stay untouched. Do not suggest a solution, pattern or class name.',
        user: [
          `Problem: ${problem.title}. ${problem.summary}`,
          `Point of change to target: ${point.name}: ${point.description}`,
          `How the candidate's design handles it today: ${
            target.status === 'missing'
              ? `no abstraction${target.heldBy ? `; the behaviour sits inside ${target.heldBy}` : ''}`
              : target.status === 'no-implementations'
                ? `an abstraction (${target.heldBy}) with no implementations`
                : `behind ${target.heldBy}`
          }.`,
          `Their classes: ${design.entities.map((e) => e.name).filter(Boolean).join(', ') || '(none)'}.`,
          `Example of the expected style: ${JSON.stringify(fallback)}`,
        ].join('\n'),
        jsonSchema: {
          type: 'object',
          additionalProperties: false,
          required: ['title', 'prompt'],
          properties: { title: { type: 'string', maxLength: 80 }, prompt: { type: 'string', maxLength: 600 } },
        },
        grounding: { problem, design, facts: [] },
      },
      AbortSignal.timeout(30_000),
    );
    const parsed = wordingSchema.safeParse(JSON.parse(response.text));
    return parsed.success ? parsed.data : null;
  }
}
