import type { SubmissionStatus } from '@blueprint/shared';
import { InvalidTransitionError } from './errors';

/**
 * The submission state machine, as an explicit transition table.
 *
 *   submitted ──start──▶ evaluating ──complete──▶ evaluated
 *       ▲                    │ ├──────partial───▶ evaluated_partial ──retry──┐
 *       │                    │ └──────fail──────▶ failed ───────────retry────┤
 *       └──────requeue───────┘                                               │
 *       └────────────────────────────────────────────────────────────────────┘
 *
 * Keeping every legal move in one table makes illegal moves impossible to
 * express accidentally and trivial to test exhaustively.
 */
export type SubmissionEvent = 'start' | 'complete' | 'partial' | 'fail' | 'requeue' | 'retry';

const TRANSITIONS: Record<SubmissionStatus, Partial<Record<SubmissionEvent, SubmissionStatus>>> = {
  submitted: { start: 'evaluating' },
  evaluating: { complete: 'evaluated', partial: 'evaluated_partial', fail: 'failed', requeue: 'submitted' },
  evaluated: {},
  evaluated_partial: { retry: 'submitted' },
  failed: { retry: 'submitted' },
};

export const SubmissionLifecycle = {
  next(from: SubmissionStatus, event: SubmissionEvent): SubmissionStatus {
    const to = TRANSITIONS[from][event];
    if (!to) {
      throw new InvalidTransitionError(`Cannot "${event}" a submission that is ${from.replace('_', ' ')}.`, {
        from,
        event,
      });
    }
    return to;
  },
  can(from: SubmissionStatus, event: SubmissionEvent): boolean {
    return TRANSITIONS[from][event] !== undefined;
  },
};
