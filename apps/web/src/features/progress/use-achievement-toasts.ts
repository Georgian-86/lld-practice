import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { api, queryKeys } from '@/api/client';
import { safeStorage } from '@/lib/storage';

const KEY = 'blueprint.achievementsSeen';

function readSeen(): string[] | null {
  const raw = safeStorage.get(KEY);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : null;
  } catch {
    return null;
  }
}

/**
 * Announces achievements the first time this browser sees them earned.
 * A learner with history but no record yet (e.g. a new browser) is caught up
 * silently instead of being flooded with toasts.
 */
export function useAchievementToasts(enabled: boolean) {
  const navigate = useNavigate();
  const { data } = useQuery({ queryKey: queryKeys.progress, queryFn: api.progress, enabled });
  useEffect(() => {
    if (!enabled || !data) return;
    const earned = data.achievements.filter((a) => a.earnedAt);
    const seen = readSeen() ?? (data.totals.submissions <= 1 ? [] : earned.map((a) => a.id));
    const fresh = earned.filter((a) => !seen.includes(a.id));
    fresh.forEach((a, i) =>
      setTimeout(
        () =>
          toast.success(`Achievement unlocked: ${a.title}`, {
            description: a.description,
            action: { label: 'Progress', onClick: () => navigate('/progress') },
          }),
        600 + i * 400,
      ),
    );
    safeStorage.set(KEY, JSON.stringify([...new Set([...seen, ...earned.map((a) => a.id)])]));
  }, [enabled, data, navigate]);
}
