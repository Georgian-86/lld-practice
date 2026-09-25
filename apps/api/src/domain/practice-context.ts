import type { Draft } from '@blueprint/shared';

/** A curveball this version answered: the change request taken after an earlier version. */
export interface CurveballAnswer {
  /** Deck id, `adaptive` for a generated one, or `default` for older drafts that named none. */
  curveballId: string;
  /** The version whose design the curveball was applied to. */
  fromVersion: number;
}

/** How a timed interview went for this version. */
export interface InterviewTiming {
  minutes: number;
  usedMinutes: number;
  withinTime: boolean;
}

/**
 * The practice mode a submission was made in, read from the submitted draft.
 * The draft stores what the learner accepted; this value object is the single
 * place that interprets it (a curveball only counts for a *later* version, and
 * a timer only counts once the submission time is known), so the report,
 * summaries and achievements always agree.
 */
export class PracticeContext {
  private constructor(
    readonly curveball: CurveballAnswer | null,
    readonly timing: InterviewTiming | null,
  ) {}

  static of(submission: { draft: Draft; version: number; submittedAt: string }): PracticeContext {
    const { challenge, timer } = submission.draft;
    const curveball =
      challenge && challenge.fromVersion < submission.version
        ? { curveballId: challenge.curveballId ?? 'default', fromVersion: challenge.fromVersion }
        : null;
    const usedMs = timer ? Date.parse(submission.submittedAt) - Date.parse(timer.startedAt) : NaN;
    const timing =
      timer && Number.isFinite(usedMs) && usedMs >= 0
        ? { minutes: timer.minutes, usedMinutes: Math.round((usedMs / 60_000) * 10) / 10, withinTime: usedMs <= timer.minutes * 60_000 }
        : null;
    return new PracticeContext(curveball, timing);
  }
}
