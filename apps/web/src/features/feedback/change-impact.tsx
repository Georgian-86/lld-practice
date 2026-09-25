import { useQuery } from '@tanstack/react-query';
import type { DesignImpact, DesignModel, EntityImpact } from '@blueprint/shared';
import { diffDesigns, IMPACT_VERDICT_TEXT } from '@blueprint/shared';
import { CircleMinus, CirclePlus, PencilLine } from 'lucide-react';
import { useMemo } from 'react';
import { api, queryKeys } from '@/api/client';
import { cn } from '@/lib/cn';

/** Diff of `design` against an earlier submission's design (null until that submission loads). */
export function useImpact(baseSubmissionId: string | null | undefined, design: DesignModel): DesignImpact | null {
  const base = useQuery({
    queryKey: queryKeys.submission(baseSubmissionId ?? ''),
    queryFn: () => api.submission(baseSubmissionId!),
    enabled: Boolean(baseSubmissionId),
    staleTime: Infinity,
  });
  const before = base.data?.draft.design;
  return useMemo(() => (before ? diffDesigns(before, design) : null), [before, design]);
}

export const VERDICT_TONE = {
  none: 'text-muted',
  extended: 'text-success',
  contained: 'text-primary',
  rippled: 'text-warning',
} as const;

/** Compact "+2 new · 1 changed · 9 untouched" line. */
export function ImpactCounts({ impact, className }: { impact: DesignImpact; className?: string }) {
  const { added, modified, unchanged, removed } = impact.counts;
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-x-3 gap-y-1 tabular-nums', className)}>
      <span>
        <span className="font-semibold text-success">+{added}</span> new
      </span>
      <span>
        <span className={cn('font-semibold', modified ? 'text-warning' : 'text-fg')}>{modified}</span> changed
      </span>
      {removed > 0 && (
        <span>
          <span className="font-semibold text-danger">{removed}</span> removed
        </span>
      )}
      <span>
        <span className="font-semibold text-fg">{unchanged}</span> untouched
      </span>
    </span>
  );
}

/** Inspector content for the "change since vN" view of the report canvas. */
export function ImpactPanel({ impact, baseVersion }: { impact: DesignImpact; baseVersion: number }) {
  const verdict = IMPACT_VERDICT_TEXT[impact.verdict];
  const group = (status: EntityImpact['status']) => impact.entities.filter((e) => e.status === status);
  return (
    <>
      <div className="flex h-12 shrink-0 items-center border-b border-border px-4">
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold text-fg">Change since version {baseVersion}</div>
          <div className="truncate text-[11.5px] text-muted">How much of the existing design had to change</div>
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 scrollbar-thin">
        <div>
          <div className={cn('text-[15px] font-semibold', VERDICT_TONE[impact.verdict])}>{verdict.title}</div>
          <p className="mt-1 text-[12.5px] leading-relaxed text-fg-2">{verdict.body}</p>
          <ImpactCounts impact={impact} className="mt-2 text-[12.5px] text-muted" />
        </div>
        <ImpactList title="Changed" icon={<PencilLine className="size-3.5 text-warning" />} items={group('modified')} showChanges />
        <ImpactList title="New" icon={<CirclePlus className="size-3.5 text-success" />} items={group('added')} />
        <ImpactList title="Removed" icon={<CircleMinus className="size-3.5 text-danger" />} items={group('removed')} />
      </div>
    </>
  );
}

function ImpactList({ title, icon, items, showChanges = false }: { title: string; icon: React.ReactNode; items: EntityImpact[]; showChanges?: boolean }) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
        {title} · {items.length}
      </div>
      <ul className="space-y-1.5">
        {items.map((e) => (
          <li key={e.id} className="text-[12.5px]">
            <div className="flex items-center gap-1.5 font-medium text-fg">
              {icon}
              {e.name}
            </div>
            {showChanges && (
              <ul className="ml-5 mt-0.5 space-y-0.5 font-mono text-[11.5px] text-muted">
                {e.changes.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
