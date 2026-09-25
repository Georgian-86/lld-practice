import type { Finding } from '@blueprint/shared';
import { CRITERIA } from '@blueprint/shared';
import { AlertOctagon, AlertTriangle, ArrowRight, CircleDot, Info, Lightbulb, Sparkles, ThumbsUp, Wrench } from 'lucide-react';
import { Link } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/cn';

function visual(f: Finding) {
  if (f.kind === 'strength') return { Icon: ThumbsUp, iconClass: 'bg-success-soft text-success', label: null };
  if (f.kind === 'suggestion') {
    return f.severity === 'info'
      ? { Icon: Info, iconClass: 'bg-surface-2 text-muted', label: null }
      : { Icon: Lightbulb, iconClass: 'bg-info-soft text-info', label: { text: 'Suggestion', tone: 'info' as const } };
  }
  switch (f.severity) {
    case 'critical':
      return { Icon: AlertOctagon, iconClass: 'bg-danger-soft text-danger', label: { text: 'Critical', tone: 'danger' as const } };
    case 'major':
      return { Icon: AlertTriangle, iconClass: 'bg-warning-soft text-warning', label: { text: 'Important', tone: 'warning' as const } };
    case 'minor':
      return { Icon: CircleDot, iconClass: 'bg-surface-2 text-fg-2', label: { text: 'Minor', tone: 'neutral' as const } };
    default:
      return { Icon: Info, iconClass: 'bg-surface-2 text-muted', label: null };
  }
}

export function SourceBadge({ source, simulated }: { source: Finding['source']; simulated?: boolean }) {
  return source === 'ai' ? (
    <Tooltip content={simulated ? 'From the offline AI simulator (no API key configured).' : 'Judgement from the AI reviewer, grounded on the rule checks.'}>
      <span className="inline-flex">
        <Badge tone="ai">
          <Sparkles className="size-3" /> AI{simulated ? ' (sim)' : ''}
        </Badge>
      </span>
    </Tooltip>
  ) : (
    <Tooltip content="Deterministic design check — same input, same result.">
      <span className="inline-flex">
        <Badge tone="neutral">
          <Wrench className="size-3" /> Rule
        </Badge>
      </span>
    </Tooltip>
  );
}

/** Where in the editor a piece of evidence can be fixed. */
export function evidenceHref(attemptId: string, item: { requirementId?: string; entity?: string }): string {
  const params = new URLSearchParams(
    item.requirementId ? { tab: 'traceability', focus: item.requirementId } : { tab: 'canvas', focus: item.entity ?? '' },
  );
  return `/attempts/${attemptId}?${params.toString()}`;
}

export function FindingCard({
  finding,
  simulated,
  compact = false,
  attemptId,
}: {
  finding: Finding;
  simulated?: boolean;
  compact?: boolean;
  /** When set, evidence chips link into the editor at the right place. */
  attemptId?: string;
}) {
  const { Icon, iconClass, label } = visual(finding);
  const evidence: { key: string; requirementId?: string; entity?: string }[] = [
    ...(finding.evidence.requirementIds ?? []).map((id) => ({ key: id, requirementId: id })),
    ...(finding.evidence.entities ?? []).map((name) => ({ key: name, entity: name })),
  ];
  return (
    <article className={cn('flex gap-3.5 rounded-xl border border-border bg-surface p-4', compact && 'p-3.5')}>
      <div className={cn('grid size-8 shrink-0 place-items-center rounded-lg', iconClass)}>
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h4 className="text-[14px] font-semibold leading-snug text-fg">{finding.title}</h4>
          {label && <Badge tone={label.tone}>{label.text}</Badge>}
        </div>
        <p className="mt-1 text-[13px] leading-relaxed text-fg-2">{finding.message}</p>
        {finding.suggestion && !compact && (
          <div className="mt-2.5 flex gap-2 rounded-lg bg-surface-2 px-3 py-2 text-[13px] leading-relaxed text-fg-2">
            <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-primary" />
            <span>{finding.suggestion}</span>
          </div>
        )}
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <SourceBadge source={finding.source} simulated={simulated} />
          <span className="text-xs text-subtle">{CRITERIA[finding.criterionId].name}</span>
          {evidence.length > 0 && <span className="text-xs text-subtle">·</span>}
          {evidence.slice(0, 6).map((e) =>
            attemptId ? (
              <Tooltip key={e.key} content={e.requirementId ? `Open ${e.key} in the Traceability tab` : `Show ${e.key} on your diagram`}>
                <Link
                  to={evidenceHref(attemptId, e)}
                  className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-fg-2 underline decoration-border-strong decoration-dotted underline-offset-2 transition hover:bg-primary-soft hover:text-primary-soft-fg hover:decoration-primary"
                >
                  {e.key}
                </Link>
              </Tooltip>
            ) : (
              <code key={e.key} className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-fg-2">
                {e.key}
              </code>
            ),
          )}
          {evidence.length > 6 && <span className="text-xs text-subtle">+{evidence.length - 6}</span>}
        </div>
      </div>
    </article>
  );
}
