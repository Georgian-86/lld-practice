import { describe, expect, it } from 'vitest';
import { SUBMISSION_STATUSES } from '@blueprint/shared';
import { Attempt } from '../../src/domain/attempt';
import { InvalidTransitionError, ValidationError } from '../../src/domain/errors';
import { SubmissionLifecycle, type SubmissionEvent } from '../../src/domain/submission-lifecycle';

const now = new Date('2026-01-01T00:00:00Z');

describe('SubmissionLifecycle', () => {
  const legal: [string, SubmissionEvent, string][] = [
    ['submitted', 'start', 'evaluating'],
    ['evaluating', 'complete', 'evaluated'],
    ['evaluating', 'partial', 'evaluated_partial'],
    ['evaluating', 'fail', 'failed'],
    ['evaluating', 'requeue', 'submitted'],
    ['evaluated_partial', 'retry', 'submitted'],
    ['failed', 'retry', 'submitted'],
  ];

  it.each(legal)('%s --%s--> %s', (from, event, to) => {
    expect(SubmissionLifecycle.next(from as never, event)).toBe(to);
  });

  it('rejects every transition not in the table', () => {
    const events: SubmissionEvent[] = ['start', 'complete', 'partial', 'fail', 'requeue', 'retry'];
    for (const from of SUBMISSION_STATUSES) {
      for (const event of events) {
        const isLegal = legal.some(([f, e]) => f === from && e === event);
        if (isLegal) continue;
        expect(() => SubmissionLifecycle.next(from, event), `${from} --${event}-->`).toThrow(InvalidTransitionError);
      }
    }
  });

  it('never allows a completed evaluation to be retried', () => {
    expect(SubmissionLifecycle.can('evaluated', 'retry')).toBe(false);
  });
});

describe('Attempt', () => {
  const start = () => Attempt.start({ id: 'att_1', learnerId: 'l1', problemId: 'parking-lot', now });

  it('starts with an empty structured draft', () => {
    const attempt = start();
    expect(attempt.draft.format).toBe('structured');
    expect(attempt.draft.design.entities).toEqual([]);
  });

  it('reveals hints progressively and records them once', () => {
    const attempt = start();
    attempt.revealHint(1, [1, 2, 3], now);
    attempt.revealHint(1, [1, 2, 3], now);
    attempt.revealHint(2, [1, 2, 3], now);
    expect(attempt.revealedHintLevels).toEqual([1, 2]);
  });

  it('refuses to skip ahead to a later hint', () => {
    const attempt = start();
    expect(() => attempt.revealHint(3, [1, 2, 3], now)).toThrow(/Reveal hint 1 before hint 3/);
  });

  it('refuses hint levels the problem does not have', () => {
    expect(() => start().revealHint(9, [1, 2, 3], now)).toThrow(ValidationError);
  });

  it('round-trips through a snapshot without sharing state', () => {
    const attempt = start();
    attempt.revealHint(1, [1, 2], now);
    const restored = Attempt.restore(attempt.toSnapshot());
    restored.revealHint(2, [1, 2], now);
    expect(attempt.revealedHintLevels).toEqual([1]);
    expect(restored.revealedHintLevels).toEqual([1, 2]);
  });
});
