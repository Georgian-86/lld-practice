import { z } from 'zod';
import { draftSchema, type Draft, type SubmissionFormat } from './design';
import type { Difficulty, Problem } from './problem';
import type { CriterionId } from './problem';
import type { EvaluationReport, Finding } from './evaluation';

/* ----------------------------- Submission status ----------------------------- */

export const SUBMISSION_STATUSES = [
  'submitted',
  'evaluating',
  'evaluated',
  'evaluated_partial',
  'failed',
] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

export const TERMINAL_STATUSES: readonly SubmissionStatus[] = ['evaluated', 'evaluated_partial', 'failed'];

export function isTerminal(status: SubmissionStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/* ----------------------------------- DTOs ----------------------------------- */

export interface ProblemSummaryDTO {
  id: string;
  title: string;
  difficulty: Difficulty;
  estimatedMinutes: number;
  summary: string;
  tags: string[];
  requirementCount: number;
  rubric: Record<CriterionId, number>;
  /** A worked sample exists: "see a sample report" is available. */
  hasSample: boolean;
  progress: {
    attempts: number;
    submissions: number;
    bestScore: number | null;
    lastScore: number | null;
    latestAttemptId: string | null;
  };
}

/** Problem detail without hint text: hints are revealed one at a time and recorded. */
export type ProblemDTO = Omit<Problem, 'hints'> & {
  hints: { level: number; title: string }[];
};

export interface HintDTO {
  level: number;
  title: string;
  text: string;
}

export interface SubmissionSummaryDTO {
  id: string;
  attemptId: string;
  problemId: string;
  version: number;
  format: SubmissionFormat;
  status: SubmissionStatus;
  statusMessage: string | null;
  submittedAt: string;
  updatedAt: string;
  overallScore: number | null;
  /** Set when this version answered a curveball taken after an earlier version. */
  curveballId: string | null;
  /** Set when this version was designed under the interview timer. */
  timed: { minutes: number; usedMinutes: number } | null;
}

export interface AttemptDTO {
  id: string;
  problemId: string;
  problemTitle: string;
  draft: Draft;
  revealedHints: HintDTO[];
  createdAt: string;
  updatedAt: string;
  submissions: SubmissionSummaryDTO[];
}

export interface SubmissionDTO extends SubmissionSummaryDTO {
  draft: Draft;
  hintsUsed: number;
  evaluation: EvaluationReport | null;
  /** Server-suggested polling delay while the submission is not terminal. */
  pollAfterMs: number | null;
}

export interface ComparisonDTO {
  base: SubmissionSummaryDTO;
  target: SubmissionSummaryDTO;
  scoreDelta: number | null;
  criteria: { criterionId: CriterionId; name: string; base: number | null; target: number | null; delta: number | null }[];
  resolved: Finding[];
  introduced: Finding[];
  persisting: Finding[];
  newStrengths: Finding[];
}

export interface ProgressDTO {
  totals: {
    attempts: number;
    submissions: number;
    problemsPracticed: number;
    averageScore: number | null;
    bestScore: number | null;
  };
  recent: (SubmissionSummaryDTO & { problemTitle: string })[];
  criterionAverages: { criterionId: CriterionId; name: string; average: number | null }[];
  achievements: AchievementDTO[];
}

export interface AchievementDTO {
  id: string;
  title: string;
  /** What earns it, phrased as a goal. */
  description: string;
  earnedAt: string | null;
  /** For count-based achievements. */
  progress?: { current: number; target: number };
}

/** A curveball aimed at the weakest point of change in a submitted design. */
export interface AdaptiveCurveballDTO {
  id: 'adaptive';
  title: string;
  prompt: string;
  variationPoints: string[];
  /** Why this one: the point of change it targets and how the design handles it today. */
  target: {
    variationPointId: string;
    name: string;
    status: 'missing' | 'no-implementations' | 'covered';
    /** The class that currently holds this behaviour, if any. */
    heldBy: string | null;
  };
  wordedBy: 'ai' | 'template';
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

/* --------------------------------- Requests --------------------------------- */

export const startAttemptRequestSchema = z.object({ problemId: z.string().min(1).max(64) });
export const saveDraftRequestSchema = z.object({ draft: draftSchema });
export const revealHintRequestSchema = z.object({ level: z.number().int().min(1).max(10) });

export type StartAttemptRequest = z.infer<typeof startAttemptRequestSchema>;
export type SaveDraftRequest = z.infer<typeof saveDraftRequestSchema>;
