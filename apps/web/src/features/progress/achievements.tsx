import type { AchievementDTO } from '@blueprint/shared';
import { Award, Clock3, Footprints, Layers, Lightbulb, Lock, Mountain, Plug, Route, Sparkles, TrendingUp, Trophy } from 'lucide-react';
import type { ComponentType } from 'react';
import { Card, CardHeader } from '@/components/ui/card';
import { Meter } from '@/components/ui/score';
import { cn } from '@/lib/cn';
import { timeAgo } from '@/lib/format';

const ICONS: Record<string, ComponentType<{ className?: string }>> = {
  'first-blueprint': Footprints,
  iterator: TrendingUp,
  walkthrough: Route,
  'open-closed': Layers,
  'seam-finder': Plug,
  'beat-the-clock': Clock3,
  'no-hints': Lightbulb,
  'ninety-club': Trophy,
  'hard-mode': Mountain,
  'full-catalogue': Sparkles,
};

/** Milestones that reward how you practise (iterate, walk through, absorb change), not just scores. */
export function Achievements({ achievements }: { achievements: AchievementDTO[] }) {
  const earned = achievements.filter((a) => a.earnedAt).length;
  // Earned first (newest first), then the rest in their defined order.
  const sorted = [...achievements].sort((a, b) => (a.earnedAt && b.earnedAt ? b.earnedAt.localeCompare(a.earnedAt) : a.earnedAt ? -1 : b.earnedAt ? 1 : 0));
  return (
    <Card className="mt-6">
      <CardHeader
        title="Achievements"
        icon={<Award className="size-4" />}
        description={`${earned} of ${achievements.length} earned · they reward how you practise, not just your scores`}
      />
      <ul className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2 lg:grid-cols-5">
        {sorted.map((a) => {
          const Icon = ICONS[a.id] ?? Award;
          const done = Boolean(a.earnedAt);
          return (
            <li
              key={a.id}
              className={cn('flex flex-col rounded-xl border p-3.5', done ? 'border-primary/25 bg-primary-soft/50' : 'border-dashed border-border-strong')}
              aria-label={`${a.title}: ${done ? 'earned' : 'not earned yet'}`}
            >
              <span
                className={cn(
                  'grid size-9 place-items-center rounded-lg',
                  done ? 'bg-primary-solid text-primary-fg shadow-sm' : 'bg-surface-2 text-subtle',
                )}
              >
                {done ? <Icon className="size-4" /> : <Lock className="size-3.5" />}
              </span>
              <span className={cn('mt-2.5 text-[13px] font-semibold', done ? 'text-fg' : 'text-fg-2')}>{a.title}</span>
              <span className="mt-0.5 text-[12px] leading-snug text-muted">{a.description}</span>
              {a.progress && !done && (
                <span className="mt-2">
                  <Meter value={(a.progress.current / a.progress.target) * 100} className="h-1" label={`${a.title} progress`} tone="primary" />
                  <span className="mt-1 block text-[11px] tabular-nums text-muted">
                    {a.progress.current} / {a.progress.target}
                  </span>
                </span>
              )}
              {done && <span className="mt-auto pt-2 text-[11px] font-medium text-primary-soft-fg">Earned {timeAgo(a.earnedAt!)}</span>}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
