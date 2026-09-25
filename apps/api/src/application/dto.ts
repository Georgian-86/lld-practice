import type {
  AttemptDTO,
  Draft,
  EvaluationReport,
  Problem,
  ProblemDTO,
  SubmissionDTO,
  SubmissionSummaryDTO,
} from '@blueprint/shared';
import { isTerminal } from '@blueprint/shared';
import type { Attempt } from '../domain/attempt';
import { PracticeContext } from '../domain/practice-context';
import type { Submission } from '../domain/submission';

export function toProblemDTO(problem: Problem): ProblemDTO {
  return { ...problem, hints: problem.hints.map(({ level, title }) => ({ level, title })) };
}

export function toSubmissionSummary(submission: Submission, report?: EvaluationReport): SubmissionSummaryDTO {
  const s = submission.toSnapshot();
  return {
    id: s.id,
    attemptId: s.attemptId,
    problemId: s.problemId,
    version: s.version,
    format: s.format,
    status: s.status,
    statusMessage: s.statusMessage,
    submittedAt: s.submittedAt,
    updatedAt: s.updatedAt,
    overallScore: report?.overallScore ?? null,
    ...submissionContext(s.draft, s.version, s.submittedAt),
  };
}

/** What the learner was practising when they submitted: a curveball, the interview timer. */
export function submissionContext(draft: Draft, version: number, submittedAt: string): Pick<SubmissionSummaryDTO, 'curveballId' | 'timed'> {
  const context = PracticeContext.of({ draft, version, submittedAt });
  return {
    curveballId: context.curveball?.curveballId ?? null,
    timed: context.timing ? { minutes: context.timing.minutes, usedMinutes: context.timing.usedMinutes } : null,
  };
}

export function toSubmissionDTO(submission: Submission, report: EvaluationReport | undefined, pollAfterMs: number): SubmissionDTO {
  const s = submission.toSnapshot();
  return {
    ...toSubmissionSummary(submission, report),
    draft: s.draft,
    hintsUsed: s.hintsUsed,
    evaluation: report ?? null,
    pollAfterMs: isTerminal(s.status) ? null : pollAfterMs,
  };
}

export function toAttemptDTO(
  attempt: Attempt,
  problem: Problem,
  submissions: Submission[],
  reports: Map<string, EvaluationReport>,
): AttemptDTO {
  const s = attempt.toSnapshot();
  return {
    id: s.id,
    problemId: s.problemId,
    problemTitle: problem.title,
    draft: s.draft,
    revealedHints: problem.hints.filter((h) => s.revealedHintLevels.includes(h.level)),
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    submissions: submissions.map((sub) => toSubmissionSummary(sub, reports.get(sub.id))),
  };
}
