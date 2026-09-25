import type {
  AlternativeApproach,
  CriterionId,
  DesignModel,
  Finding,
  Problem,
} from '@blueprint/shared';
import type { DesignIndex } from './design-index';

export interface EvaluationContext {
  problem: Problem;
  design: DesignModel;
  index: DesignIndex;
  /** Findings produced by evaluators that already ran (deterministic facts for the LLM). */
  priorFindings: Finding[];
}

export interface CriterionRating {
  /** 1 (poor) .. 5 (excellent) */
  rating: number;
  rationale: string;
}

export interface EvaluatorOutput {
  findings: Finding[];
  ratings?: Partial<Record<CriterionId, CriterionRating>>;
  summary?: string;
  alternatives?: AlternativeApproach[];
  nextStep?: string;
  /** Free-form detail shown in the report's "how this was evaluated" section. */
  detail?: string;
}

/**
 * Strategy interface for anything that can judge a design. Deterministic
 * evaluators always run first; LLM evaluators receive their findings as
 * grounding facts. New approaches (a peer-review evaluator, a code-analysis
 * evaluator) implement this and are added to the pipeline — nothing else changes.
 */
export interface Evaluator {
  readonly id: string;
  readonly version: string;
  readonly kind: 'deterministic' | 'llm';
  evaluate(context: EvaluationContext): Promise<EvaluatorOutput>;
}

/** One deterministic check. Small, pure, independently testable. */
export interface DesignRule {
  readonly id: string;
  readonly criterionId: CriterionId;
  check(index: DesignIndex, problem: Problem): Finding[];
}
