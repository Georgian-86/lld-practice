import type { CriterionId, CriterionScore, Finding, Problem, Severity } from '@blueprint/shared';
import { CRITERIA, CRITERION_IDS } from '@blueprint/shared';
import type { CriterionRating } from './evaluator';

export const SEVERITY_DEDUCTION: Record<Severity, number> = { critical: 45, major: 20, minor: 7, info: 0 };

export const SCORING = {
  /** Weight of the AI rating when both signals exist. */
  aiWeight: 0.6,
  /** A criterion with a critical rule finding can never score above this. */
  criticalCap: 50,
  /** The AI may lift a criterion at most this far above what the rules support. */
  maxAiLift: 25,
} as const;

export interface ScoreCard {
  criterionScores: CriterionScore[];
  overallScore: number;
}

/**
 * Combines deterministic evidence and AI judgement into per-criterion scores.
 * Rules set the floor of truth (they cap what the AI can claim); the AI adds
 * the qualitative judgement rules cannot make. Scores are weighted by the
 * problem's rubric.
 */
export class ScoreAggregator {
  aggregate(
    problem: Problem,
    ruleFindings: Finding[],
    aiRatings: Partial<Record<CriterionId, CriterionRating>> | null,
  ): ScoreCard {
    const criterionScores = CRITERION_IDS.map((criterionId): CriterionScore => {
      const relevant = ruleFindings.filter((f) => f.criterionId === criterionId);
      const deductions = relevant
        .filter((f) => f.kind !== 'strength')
        .reduce((sum, f) => sum + SEVERITY_DEDUCTION[f.severity], 0);
      const ruleScore = Math.max(0, 100 - deductions);
      const hasCritical = relevant.some((f) => f.kind !== 'strength' && f.severity === 'critical');
      const ai = aiRatings?.[criterionId];
      const aiScore = ai ? ai.rating * 20 : null;

      let score = aiScore === null ? ruleScore : (1 - SCORING.aiWeight) * ruleScore + SCORING.aiWeight * aiScore;
      score = Math.min(score, ruleScore + SCORING.maxAiLift);
      if (hasCritical) score = Math.min(score, SCORING.criticalCap);

      return {
        criterionId,
        name: CRITERIA[criterionId].name,
        weight: problem.rubric[criterionId],
        score: Math.round(score),
        ruleScore,
        aiScore,
        rationale: ai?.rationale ?? ruleRationale(relevant),
      };
    });

    const totalWeight = criterionScores.reduce((sum, c) => sum + c.weight, 0) || 1;
    const overallScore = Math.round(criterionScores.reduce((sum, c) => sum + c.score * c.weight, 0) / totalWeight);
    return { criterionScores, overallScore };
  }
}

function ruleRationale(findings: Finding[]): string {
  const issues = findings.filter((f) => f.kind !== 'strength' && f.severity !== 'info');
  const strengths = findings.filter((f) => f.kind === 'strength');
  if (issues.length === 0) {
    return strengths[0] ? `${strengths[0].title}.` : 'No problems detected by the automated checks.';
  }
  const worst = [...issues].sort((a, b) => SEVERITY_DEDUCTION[b.severity] - SEVERITY_DEDUCTION[a.severity])[0]!;
  const more = issues.length - 1;
  return `${worst.title}${more > 0 ? ` (+${more} more ${more === 1 ? 'issue' : 'issues'})` : ''}.`;
}
