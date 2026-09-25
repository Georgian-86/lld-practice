import { describe, expect, it } from 'vitest';
import { emptyDraft } from '@blueprint/shared';
import type { DraftAction } from './draft-reducer';
import { historyReducer, initialHistory, type History } from './use-draft-history';

const run = (h: History, ...steps: (DraftAction & { transient?: boolean } | 'undo' | 'redo' | [DraftAction, number])[]) =>
  steps.reduce<History>((acc, step, i) => {
    if (step === 'undo' || step === 'redo') return historyReducer(acc, { kind: step });
    if (Array.isArray(step)) return historyReducer(acc, { kind: 'do', action: step[0], at: step[1] });
    return historyReducer(acc, { kind: 'do', action: step, at: i * 10_000 });
  }, h);

describe('draft history', () => {
  it('undoes and redoes structural edits one at a time', () => {
    let h = run(initialHistory(emptyDraft()), { type: 'entity/add', id: 'a', name: 'A' }, { type: 'entity/add', id: 'b', name: 'B' });
    expect(h.present.design.entities).toHaveLength(2);
    h = run(h, 'undo');
    expect(h.present.design.entities.map((e) => e.name)).toEqual(['A']);
    h = run(h, 'redo');
    expect(h.present.design.entities).toHaveLength(2);
    expect(h.future).toHaveLength(0);
  });

  it('merges rapid typing on the same field into one undo step', () => {
    let h = run(initialHistory(emptyDraft()), [{ type: 'entity/add', id: 'a', name: '' }, 0]);
    ['P', 'Pa', 'Par', 'Park'].forEach((name, i) => (h = run(h, [{ type: 'entity/rename', id: 'a', name }, 5_000 + i * 100])));
    h = run(h, 'undo');
    expect(h.present.design.entities[0]!.name).toBe('');
  });

  it('keeps typing separated by a pause as separate steps', () => {
    let h = run(initialHistory(emptyDraft()), [{ type: 'entity/add', id: 'a', name: '' }, 0]);
    h = run(h, [{ type: 'entity/rename', id: 'a', name: 'Park' }, 5_000], [{ type: 'entity/rename', id: 'a', name: 'Parking' }, 9_000]);
    h = run(h, 'undo');
    expect(h.present.design.entities[0]!.name).toBe('Park');
  });

  it('does not record transient (automatic) changes', () => {
    const h = run(initialHistory(emptyDraft()), { type: 'layout/set', positions: { a: { x: 1, y: 1 } }, transient: true });
    expect(h.past).toHaveLength(0);
    expect(h.present.layout).toEqual({ a: { x: 1, y: 1 } });
  });

  it('a new edit after undo discards the redo stack', () => {
    const h = run(initialHistory(emptyDraft()), { type: 'entity/add', id: 'a', name: 'A' }, 'undo', { type: 'entity/add', id: 'b', name: 'B' });
    expect(h.future).toHaveLength(0);
    expect(h.past).toHaveLength(1);
  });
});
