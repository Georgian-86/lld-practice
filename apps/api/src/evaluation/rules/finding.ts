import type { CriterionId, Finding, FindingEvidence, FindingKind, Severity } from '@blueprint/shared';

interface RuleFindingInput {
  ruleId: string;
  criterionId: CriterionId;
  kind: FindingKind;
  severity: Severity;
  title: string;
  message: string;
  suggestion?: string;
  evidence?: FindingEvidence;
  /** Distinguishes several findings from the same rule, e.g. the requirement id. */
  key?: string;
}

export function ruleFinding(input: RuleFindingInput): Finding {
  const { ruleId, key, evidence, ...rest } = input;
  return {
    ...rest,
    evidence: evidence ?? {},
    source: 'rule',
    ruleId,
    fingerprint: `${ruleId}:${input.kind}:${(key ?? '').toLowerCase()}`,
  };
}
