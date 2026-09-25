import type { CriterionId } from './problem';

export const SEVERITIES = ['critical', 'major', 'minor', 'info'] as const;
export type Severity = (typeof SEVERITIES)[number];

export const FINDING_KINDS = ['issue', 'suggestion', 'strength'] as const;
export type FindingKind = (typeof FINDING_KINDS)[number];

/** Where a finding came from. Shown to learners so they know how much to trust it. */
export type FindingSource = 'rule' | 'ai';

export interface FindingEvidence {
  entities?: string[];
  relationships?: string[];
  requirementIds?: string[];
}

export interface Finding {
  /**
   * Stable identity used to compare attempts ("resolved since last time").
   * Rule findings use ruleId + evidence; AI findings use criterion + title.
   */
  fingerprint: string;
  criterionId: CriterionId;
  kind: FindingKind;
  severity: Severity;
  title: string;
  message: string;
  suggestion?: string;
  evidence: FindingEvidence;
  source: FindingSource;
  ruleId?: string;
}

export interface CriterionScore {
  criterionId: CriterionId;
  name: string;
  weight: number;
  /** 0..100 */
  score: number;
  ruleScore: number;
  aiScore: number | null;
  rationale: string;
}

export interface AlternativeApproach {
  title: string;
  description: string;
  whenBetter: string;
}

export interface EvaluatorRun {
  evaluatorId: string;
  version: string;
  kind: 'deterministic' | 'llm';
  status: 'ok' | 'failed' | 'skipped';
  durationMs: number;
  error?: string;
  /** e.g. model name or "simulated" */
  detail?: string;
}

export type EvaluationCompleteness = 'complete' | 'partial';

export interface EvaluationReport {
  id: string;
  submissionId: string;
  completeness: EvaluationCompleteness;
  overallScore: number;
  grade: Grade;
  summary: string;
  criterionScores: CriterionScore[];
  findings: Finding[];
  alternatives: AlternativeApproach[];
  nextStep: string | null;
  evaluators: EvaluatorRun[];
  createdAt: string;
}

export type Grade = 'excellent' | 'strong' | 'developing' | 'needs-work';

export function gradeFor(score: number): Grade {
  if (score >= 85) return 'excellent';
  if (score >= 70) return 'strong';
  if (score >= 50) return 'developing';
  return 'needs-work';
}

export const GRADE_LABELS: Record<Grade, string> = {
  excellent: 'Excellent',
  strong: 'Strong',
  developing: 'Developing',
  'needs-work': 'Needs work',
};

export const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, major: 1, minor: 2, info: 3 };
