import type { Clock, EvaluationRepository, ProblemCatalog, SubmissionRepository } from '../domain/ports';
import type { EvaluationPipeline, EvaluationStage } from '../evaluation/pipeline';

const STAGE_MESSAGES: Record<EvaluationStage, string> = {
  rules: 'Running design checks',
  ai: 'AI reviewer is reading your design',
  scoring: 'Scoring and preparing feedback',
};

export type EvaluationOutcome = 'evaluated' | 'evaluated_partial' | 'skipped';

/**
 * Runs the pipeline for one submission and records the outcome. Called by
 * the background worker; knows nothing about queues or retries.
 */
export class EvaluationService {
  constructor(
    private readonly deps: {
      problems: ProblemCatalog;
      submissions: SubmissionRepository;
      evaluations: EvaluationRepository;
      pipeline: EvaluationPipeline;
      clock: Clock;
    },
  ) {}

  async evaluate(submissionId: string): Promise<EvaluationOutcome> {
    const { submissions, evaluations, pipeline, clock } = this.deps;
    const submission = await submissions.findById(submissionId);
    if (!submission || submission.isSettled) return 'skipped';

    // A crashed worker can leave a submission mid-evaluation; start it over.
    if (submission.status === 'evaluating') submission.apply('requeue', clock.now());
    submission.apply('start', clock.now(), STAGE_MESSAGES.rules);
    await submissions.save(submission);

    const problem = this.deps.problems.get(submission.problemId);
    if (!problem) throw new Error(`Problem ${submission.problemId} no longer exists`);

    const report = await pipeline.run(
      { submissionId: submission.id, problem, design: submission.design },
      async (stage) => {
        submission.annotate(STAGE_MESSAGES[stage], clock.now());
        await submissions.save(submission);
      },
    );
    await evaluations.save(report);

    if (report.completeness === 'partial') {
      submission.apply('partial', clock.now(), 'AI review unavailable — showing automated checks only');
      await submissions.save(submission);
      return 'evaluated_partial';
    }
    submission.apply('complete', clock.now());
    await submissions.save(submission);
    return 'evaluated';
  }

  /** Marks a submission as retrying (transient failure) or failed (gave up). */
  async recordFailure(submissionId: string, message: string, willRetry: boolean): Promise<void> {
    const submission = await this.deps.submissions.findById(submissionId);
    if (!submission || submission.status !== 'evaluating') return;
    const now = this.deps.clock.now();
    if (willRetry) submission.apply('requeue', now, 'Something went wrong — retrying shortly');
    else submission.apply('fail', now, message);
    await this.deps.submissions.save(submission);
  }
}
