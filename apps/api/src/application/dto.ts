import type {
  AttemptDTO,
  EvaluationReport,
  Problem,
  ProblemDTO,
  SubmissionDTO,
  SubmissionSummaryDTO,
} from '@blueprint/shared';
import { isTerminal } from '@blueprint/shared';
import type { Attempt } from '../domain/attempt';
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
