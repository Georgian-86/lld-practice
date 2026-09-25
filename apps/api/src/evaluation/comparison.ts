import type { EvaluationReport, Finding } from '@blueprint/shared';

export interface FindingDiff {
  resolved: Finding[];
  introduced: Finding[];
  persisting: Finding[];
  newStrengths: Finding[];
}

/**
 * Compares two evaluations by finding fingerprint. Rule findings have stable
 * fingerprints, so "resolved" is reliable for them; AI findings are matched
 * by criterion + title, which is best-effort.
 */
export function diffFindings(base: EvaluationReport, target: EvaluationReport): FindingDiff {
  const problems = (r: EvaluationReport) => r.findings.filter((f) => f.kind !== 'strength');
  const baseIssues = new Map(problems(base).map((f) => [f.fingerprint, f]));
  const targetIssues = new Map(problems(target).map((f) => [f.fingerprint, f]));
  const baseStrengths = new Set(base.findings.filter((f) => f.kind === 'strength').map((f) => f.fingerprint));

  return {
    resolved: [...baseIssues.values()].filter((f) => !targetIssues.has(f.fingerprint)),
    introduced: [...targetIssues.values()].filter((f) => !baseIssues.has(f.fingerprint)),
    persisting: [...targetIssues.values()].filter((f) => baseIssues.has(f.fingerprint)),
    newStrengths: target.findings.filter((f) => f.kind === 'strength' && !baseStrengths.has(f.fingerprint)),
  };
}
