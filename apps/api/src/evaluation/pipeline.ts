import type { DesignModel, EvaluationReport, EvaluatorRun, Finding, Problem } from '@blueprint/shared';
import { gradeFor, SEVERITY_ORDER, CRITERIA } from '@blueprint/shared';
import type { Clock, IdGenerator } from '../domain/ports';
import { DesignIndex } from './design-index';
import type { Evaluator, EvaluatorOutput } from './evaluator';
import type { ScoreAggregator } from './score-aggregator';

export type EvaluationStage = 'rules' | 'ai' | 'scoring';

export interface PipelineInput {
  submissionId: string;
  problem: Problem;
  design: DesignModel;
}

/**
 * Composite evaluator. Runs deterministic evaluators first (they must
 * succeed — a failure there is a bug), then LLM evaluators grounded on those
 * findings (their failure degrades the report to "partial" instead of failing
 * it), then aggregates scores.
 */
export class EvaluationPipeline {
  constructor(
    private readonly deterministic: Evaluator[],
    private readonly ai: Evaluator[],
    private readonly aggregator: ScoreAggregator,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  get hasAi(): boolean {
    return this.ai.length > 0;
  }

  async run(input: PipelineInput, onStage?: (stage: EvaluationStage) => Promise<void>): Promise<EvaluationReport> {
    const index = new DesignIndex(input.design);
    const runs: EvaluatorRun[] = [];
    const ruleFindings: Finding[] = [];

    await onStage?.('rules');
    for (const evaluator of this.deterministic) {
      const started = Date.now();
      const output = await evaluator.evaluate({ ...input, index, priorFindings: [...ruleFindings] });
      ruleFindings.push(...output.findings);
      runs.push(this.run_(evaluator, 'ok', started, output.detail));
    }

    let aiOutput: EvaluatorOutput | null = null;
    let aiFailed = false;
    if (this.ai.length) await onStage?.('ai');
    for (const evaluator of this.ai) {
      const started = Date.now();
      try {
        const output = await evaluator.evaluate({ ...input, index, priorFindings: [...ruleFindings] });
        aiOutput = aiOutput ? mergeOutputs(aiOutput, output) : output;
        runs.push(this.run_(evaluator, 'ok', started, output.detail));
      } catch (error) {
        aiFailed = true;
        runs.push({
          ...this.run_(evaluator, 'failed', started),
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    await onStage?.('scoring');
    const { criterionScores, overallScore } = this.aggregator.aggregate(
      input.problem,
      ruleFindings,
      aiOutput?.ratings ?? null,
    );
    const findings = [...ruleFindings, ...(aiOutput?.findings ?? [])].sort(compareFindings);

    return {
      id: this.ids.next('eval'),
      submissionId: input.submissionId,
      completeness: aiFailed ? 'partial' : 'complete',
      overallScore,
      grade: gradeFor(overallScore),
      summary: aiOutput?.summary ?? fallbackSummary(input, ruleFindings, aiFailed),
      criterionScores,
      findings,
      alternatives: aiOutput?.alternatives ?? [],
      nextStep: aiOutput?.nextStep ?? firstSuggestion(ruleFindings),
      evaluators: runs,
      createdAt: this.clock.now().toISOString(),
    };
  }

  private run_(evaluator: Evaluator, status: EvaluatorRun['status'], started: number, detail?: string): EvaluatorRun {
    return {
      evaluatorId: evaluator.id,
      version: evaluator.version,
      kind: evaluator.kind,
      status,
      durationMs: Date.now() - started,
      ...(detail ? { detail } : {}),
    };
  }
}

function mergeOutputs(a: EvaluatorOutput, b: EvaluatorOutput): EvaluatorOutput {
  return {
    findings: [...a.findings, ...b.findings],
    ratings: { ...a.ratings, ...b.ratings },
    summary: a.summary ?? b.summary,
    alternatives: [...(a.alternatives ?? []), ...(b.alternatives ?? [])],
    nextStep: a.nextStep ?? b.nextStep,
    detail: [a.detail, b.detail].filter(Boolean).join('; '),
  };
}

const KIND_ORDER = { issue: 0, suggestion: 1, strength: 2 } as const;

function compareFindings(a: Finding, b: Finding): number {
  return (
    KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
    SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
    (a.source === b.source ? 0 : a.source === 'rule' ? -1 : 1)
  );
}

function firstSuggestion(findings: Finding[]): string | null {
  const issue = [...findings].filter((f) => f.kind === 'issue' && f.suggestion).sort(compareFindings)[0];
  return issue?.suggestion ?? null;
}

function fallbackSummary(input: PipelineInput, findings: Finding[], aiFailed: boolean): string {
  const issues = findings.filter((f) => f.kind === 'issue');
  const serious = issues.filter((f) => f.severity === 'critical' || f.severity === 'major');
  const strengths = findings.filter((f) => f.kind === 'strength');
  const worstCriterion = serious[0]?.criterionId;
  const lead = `Your ${input.design.entities.length}-class design was checked against ${input.problem.title} requirements.`;
  const body = serious.length
    ? ` ${serious.length} important ${serious.length === 1 ? 'issue' : 'issues'} to address${worstCriterion ? `, starting with ${CRITERIA[worstCriterion].name.toLowerCase()}` : ''}.`
    : ' No major structural problems were found.';
  const praise = strengths.length ? ` ${strengths.length} ${strengths.length === 1 ? 'strength' : 'strengths'} recognised.` : '';
  const ai = aiFailed ? ' The AI review could not be completed, so this report is based on automated checks only.' : '';
  return `${lead}${body}${praise}${ai}`;
}
