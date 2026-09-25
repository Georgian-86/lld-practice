import { useCallback, useSyncExternalStore } from 'react';
import { safeStorage } from '@/lib/storage';

type Theme = 'light' | 'dark';
const listeners = new Set<() => void>();

function current(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

export function useTheme() {
  const theme = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    current,
    () => 'light' as Theme,
  );
  const toggle = useCallback(() => {
    const next: Theme = current() === 'dark' ? 'light' : 'dark';
    document.documentElement.classList.toggle('dark', next === 'dark');
    safeStorage.set('blueprint.theme', next);
    listeners.forEach((l) => l());
  }, []);
  return { theme, toggle };
}
