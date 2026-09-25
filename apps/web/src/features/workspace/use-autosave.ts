import type { Draft } from '@blueprint/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/api/client';

export type SaveState = 'saved' | 'dirty' | 'saving' | 'error';

/**
 * Debounced autosave with ordering guarantees: only the newest save updates
 * the status, and pending changes are flushed on unmount / tab close.
 */
export function useAutosave(attemptId: string, draft: Draft, delayMs = 900) {
  const [state, setState] = useState<SaveState>('saved');
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const latest = useRef(draft);
  const lastSaved = useRef(draft);
  const sequence = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  latest.current = draft;

  const save = useCallback(async () => {
    clearTimeout(timer.current);
    const snapshot = latest.current;
    if (snapshot === lastSaved.current) return true;
    const seq = ++sequence.current;
    setState('saving');
    try {
      await api.saveDraft(attemptId, snapshot);
      if (seq === sequence.current) {
        lastSaved.current = snapshot;
        setSavedAt(new Date());
        setState(latest.current === snapshot ? 'saved' : 'dirty');
      }
      return true;
    } catch {
      if (seq === sequence.current) setState('error');
      return false;
    }
  }, [attemptId]);

  useEffect(() => {
    if (draft === lastSaved.current) return;
    setState((s) => (s === 'saving' ? s : 'dirty'));
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), delayMs);
    return () => clearTimeout(timer.current);
  }, [draft, delayMs, save]);

  // Flush on tab close and on leaving the page.
  useEffect(() => {
    const flush = () => {
      if (latest.current !== lastSaved.current) {
        void api.saveDraft(attemptId, latest.current, true).catch(() => undefined);
        lastSaved.current = latest.current;
      }
    };
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [attemptId]);

  /** Marks the current draft as persisted (e.g. the submit request saved it). */
  const markSaved = useCallback((snapshot: Draft) => {
    clearTimeout(timer.current);
    lastSaved.current = snapshot;
    sequence.current++;
    setSavedAt(new Date());
    setState('saved');
  }, []);

  return { state, savedAt, saveNow: save, markSaved };
}
