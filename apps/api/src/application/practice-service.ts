import { createHash } from 'node:crypto';
import type {
  AttemptDTO,
  ComparisonDTO,
  Draft,
  HintDTO,
  Problem,
  SubmissionDTO,
} from '@blueprint/shared';
import { CRITERIA, CRITERION_IDS } from '@blueprint/shared';
import { Attempt } from '../domain/attempt';
import { ConflictError, NotFoundError, ValidationError } from '../domain/errors';
import type {
  AttemptRepository,
  Clock,
  EvaluationRepository,
  IdGenerator,
  JobQueue,
  ProblemCatalog,
  SubmissionRepository,
} from '../domain/ports';
import { Submission } from '../domain/submission';
import { diffFindings } from '../evaluation/comparison';
import type { SubmissionParserRegistry } from '../formats/parsers';
import { toAttemptDTO, toSubmissionDTO, toSubmissionSummary } from './dto';

export interface PracticeServiceDeps {
  problems: ProblemCatalog;
  attempts: AttemptRepository;
  submissions: SubmissionRepository;
  evaluations: EvaluationRepository;
  queue: JobQueue;
  parsers: SubmissionParserRegistry;
  clock: Clock;
  ids: IdGenerator;
  pollAfterMs: number;
}

/**
 * The learner-facing use cases: start an attempt, save work, reveal hints,
 * submit, check status, retry, compare. Every method is scoped to a learner;
 * other learners' data is reported as "not found" rather than "forbidden" so
 * ids cannot be probed.
 */
export class PracticeService {
  constructor(private readonly deps: PracticeServiceDeps) {}

  /* ------------------------------- Attempts ------------------------------- */

  async startAttempt(learnerId: string, problemId: string): Promise<AttemptDTO> {
    const problem = this.problem(problemId);
    const attempt = Attempt.start({
      id: this.deps.ids.next('att'),
      learnerId,
      problemId: problem.id,
      now: this.deps.clock.now(),
    });
    await this.deps.attempts.save(attempt);
    return toAttemptDTO(attempt, problem, [], new Map());
  }

  async getAttempt(learnerId: string, attemptId: string): Promise<AttemptDTO> {
    const attempt = await this.ownedAttempt(learnerId, attemptId);
    return this.attemptDTO(attempt);
  }

  async listAttempts(learnerId: string, problemId?: string): Promise<AttemptDTO[]> {
    const attempts = await this.deps.attempts.listByLearner(learnerId, problemId);
    const known = attempts.filter((a) => this.deps.problems.get(a.problemId));
    return Promise.all(known.map((a) => this.attemptDTO(a)));
  }

  async saveDraft(learnerId: string, attemptId: string, draft: Draft): Promise<{ savedAt: string }> {
    const attempt = await this.ownedAttempt(learnerId, attemptId);
    const now = this.deps.clock.now();
    attempt.saveDraft(draft, now);
    await this.deps.attempts.save(attempt);
    return { savedAt: now.toISOString() };
  }

  async revealHint(learnerId: string, attemptId: string, level: number): Promise<HintDTO> {
    const attempt = await this.ownedAttempt(learnerId, attemptId);
    const problem = this.problem(attempt.problemId);
    attempt.revealHint(level, problem.hints.map((h) => h.level), this.deps.clock.now());
    await this.deps.attempts.save(attempt);
    return problem.hints.find((h) => h.level === level)!;
  }

  /* ------------------------------ Submissions ----------------------------- */

  /**
   * Accepts the draft immediately and evaluates in the background, so a slow
   * or failing AI never blocks the learner. Structural problems that make a
   * design un-evaluable are rejected here with actionable messages.
   */
  async submit(learnerId: string, attemptId: string, draft: Draft): Promise<SubmissionDTO> {
    const attempt = await this.ownedAttempt(learnerId, attemptId);
    const now = this.deps.clock.now();
    attempt.saveDraft(draft, now);
    await this.deps.attempts.save(attempt);

    const parsed = this.deps.parsers.parse(draft);
    if (!parsed.ok) {
      throw new ValidationError(parsed.errors[0]!.message, { issues: parsed.errors });
    }

    const previous = await this.deps.submissions.listByAttempt(attempt.id);
    const latest = previous.at(-1);
    if (latest && !latest.isSettled) {
      throw new ConflictError(
        'evaluation_in_progress',
        `Version ${latest.version} is still being evaluated. Wait for its feedback before submitting again.`,
        { submissionId: latest.id },
      );
    }
    const contentHash = hashDesign(parsed.design);
    if (latest && latest.contentHash === contentHash) {
      throw new ConflictError(
        'duplicate_submission',
        `Nothing changed since version ${latest.version}. Apply some feedback before resubmitting.`,
        { submissionId: latest.id },
      );
    }

    const submission = Submission.create({
      id: this.deps.ids.next('sub'),
      attemptId: attempt.id,
      learnerId,
      problemId: attempt.problemId,
      version: (latest?.version ?? 0) + 1,
      format: draft.format,
      draft,
      design: parsed.design,
      contentHash,
      hintsUsed: attempt.revealedHintLevels.length,
      now,
    });
    await this.deps.submissions.save(submission);
    await this.deps.queue.enqueue(submission.id);
    return toSubmissionDTO(submission, undefined, this.deps.pollAfterMs);
  }

  async getSubmission(learnerId: string, submissionId: string): Promise<SubmissionDTO> {
    const submission = await this.ownedSubmission(learnerId, submissionId);
    const report = await this.deps.evaluations.findBySubmission(submission.id);
    return toSubmissionDTO(submission, report, this.deps.pollAfterMs);
  }

  /** Re-runs evaluation for a partial or failed submission (e.g. once the AI is back). */
  async retryEvaluation(learnerId: string, submissionId: string): Promise<SubmissionDTO> {
    const submission = await this.ownedSubmission(learnerId, submissionId);
    submission.apply('retry', this.deps.clock.now(), 'Queued for re-evaluation');
    await this.deps.submissions.save(submission);
    await this.deps.queue.enqueue(submission.id);
    const report = await this.deps.evaluations.findBySubmission(submission.id);
    return toSubmissionDTO(submission, report, this.deps.pollAfterMs);
  }

  async compare(learnerId: string, baseId: string, targetId: string): Promise<ComparisonDTO> {
    if (baseId === targetId) throw new ValidationError('Choose two different submissions to compare.');
    const [base, target] = await Promise.all([
      this.ownedSubmission(learnerId, baseId),
      this.ownedSubmission(learnerId, targetId),
    ]);
    if (base.problemId !== target.problemId) {
      throw new ValidationError('Only submissions for the same problem can be compared.');
    }
    const reports = await this.deps.evaluations.findBySubmissions([base.id, target.id]);
    const baseReport = reports.get(base.id);
    const targetReport = reports.get(target.id);
    if (!baseReport || !targetReport) {
      throw new ConflictError('not_evaluated', 'Both submissions need feedback before they can be compared.');
    }
    const diff = diffFindings(baseReport, targetReport);
    return {
      base: toSubmissionSummary(base, baseReport),
      target: toSubmissionSummary(target, targetReport),
      scoreDelta: targetReport.overallScore - baseReport.overallScore,
      criteria: CRITERION_IDS.map((criterionId) => {
        const b = baseReport.criterionScores.find((c) => c.criterionId === criterionId)?.score ?? null;
        const t = targetReport.criterionScores.find((c) => c.criterionId === criterionId)?.score ?? null;
        return {
          criterionId,
          name: CRITERIA[criterionId].name,
          base: b,
          target: t,
          delta: b !== null && t !== null ? t - b : null,
        };
      }),
      ...diff,
    };
  }

  /* -------------------------------- Helpers ------------------------------- */

  private problem(problemId: string): Problem {
    const problem = this.deps.problems.get(problemId);
    if (!problem) throw new NotFoundError('Problem', problemId);
    return problem;
  }

  private async ownedAttempt(learnerId: string, attemptId: string): Promise<Attempt> {
    const attempt = await this.deps.attempts.findById(attemptId);
    if (!attempt || !attempt.isOwnedBy(learnerId)) throw new NotFoundError('Attempt', attemptId);
    return attempt;
  }

  private async ownedSubmission(learnerId: string, submissionId: string): Promise<Submission> {
    const submission = await this.deps.submissions.findById(submissionId);
    if (!submission || submission.learnerId !== learnerId) throw new NotFoundError('Submission', submissionId);
    return submission;
  }

  private async attemptDTO(attempt: Attempt): Promise<AttemptDTO> {
    const submissions = await this.deps.submissions.listByAttempt(attempt.id);
    const reports = await this.deps.evaluations.findBySubmissions(submissions.map((s) => s.id));
    return toAttemptDTO(attempt, this.problem(attempt.problemId), submissions, reports);
  }
}

/**
 * Stable hash of the normalised design, used to detect "nothing changed"
 * resubmits. Client-generated row ids are ignored: only content counts.
 */
export function hashDesign(design: unknown): string {
  return createHash('sha256').update(stableStringify(design)).digest('hex');
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([k, v]) => v !== undefined && k !== 'id')
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
