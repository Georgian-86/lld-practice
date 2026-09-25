import type { Draft } from '@blueprint/shared';
import { useCallback, useReducer } from 'react';
import { draftReducer, type DraftAction } from './draft-reducer';

/** Actions that come from typing: consecutive ones on the same target merge into one undo step. */
const COALESCED = new Set<DraftAction['type']>([
  'entity/update',
  'entity/rename',
  'relationship/update',
  'pattern/update',
  'text/set',
  'tradeoffs/set',
  'flow/step-update',
]);
const COALESCE_MS = 1200;
const LIMIT = 100;

/** A draft action; `transient` ones (automatic changes) update the draft without an undo step. */
export type HistoryAction = DraftAction & { transient?: boolean };
type Recordable = HistoryAction;
export type Command = { kind: 'do'; action: Recordable; at: number } | { kind: 'undo' } | { kind: 'redo' };

export interface History {
  past: Draft[];
  present: Draft;
  future: Draft[];
  lastKey: string | null;
  lastAt: number;
}

function targetKey(action: DraftAction): string {
  const a = action as { id?: string; flowId?: string; stepId?: string; field?: string };
  return `${action.type}:${a.id ?? a.stepId ?? a.field ?? ''}`;
}

export function historyReducer(h: History, cmd: Command): History {
  if (cmd.kind === 'undo') {
    const previous = h.past.at(-1);
    return previous ? { past: h.past.slice(0, -1), present: previous, future: [h.present, ...h.future], lastKey: null, lastAt: 0 } : h;
  }
  if (cmd.kind === 'redo') {
    const [next, ...rest] = h.future;
    return next ? { past: [...h.past, h.present], present: next, future: rest, lastKey: null, lastAt: 0 } : h;
  }
  const next = draftReducer(h.present, cmd.action);
  if (next === h.present) return h;
  // Automatic changes (e.g. placing unpositioned classes) are not user edits: don't record them.
  if (cmd.action.transient) return { ...h, present: next };
  const key = targetKey(cmd.action);
  const merge = COALESCED.has(cmd.action.type) && key === h.lastKey && cmd.at - h.lastAt < COALESCE_MS;
  return {
    past: merge ? h.past : [...h.past, h.present].slice(-LIMIT),
    present: next,
    future: [],
    lastKey: key,
    lastAt: cmd.at,
  };
}

export const initialHistory = (present: Draft): History => ({ past: [], present, future: [], lastKey: null, lastAt: 0 });

/** Draft state with undo/redo. `dispatch` has the same signature as the plain reducer's. */
export function useDraftHistory(initial: Draft) {
  const [h, send] = useReducer(historyReducer, initial, initialHistory);
  const dispatch = useCallback((action: Recordable) => send({ kind: 'do', action, at: Date.now() }), []);
  const undo = useCallback(() => send({ kind: 'undo' }), []);
  const redo = useCallback(() => send({ kind: 'redo' }), []);
  return { draft: h.present, dispatch, undo, redo, canUndo: h.past.length > 0, canRedo: h.future.length > 0 };
}

export type DraftHistory = ReturnType<typeof useDraftHistory>;
