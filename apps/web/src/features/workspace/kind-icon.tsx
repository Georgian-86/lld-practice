import type { EntityKind } from '@blueprint/shared';
import { cn } from '@/lib/cn';

const STYLES: Record<EntityKind, { letter: string; className: string; label: string }> = {
  class: { letter: 'C', className: 'bg-primary-soft text-primary-soft-fg', label: 'Class' },
  interface: { letter: 'I', className: 'bg-ai-soft text-ai-soft-fg', label: 'Interface' },
  abstract: { letter: 'A', className: 'bg-info-soft text-info-soft-fg', label: 'Abstract class' },
  enum: { letter: 'E', className: 'bg-warning-soft text-warning-soft-fg', label: 'Enum' },
};

export const KIND_LABELS = Object.fromEntries(Object.entries(STYLES).map(([k, v]) => [k, v.label])) as Record<EntityKind, string>;

export function KindIcon({ kind, className }: { kind: EntityKind; className?: string }) {
  const style = STYLES[kind];
  return (
    <span
      className={cn('grid size-5 shrink-0 place-items-center rounded font-mono text-[10px] font-semibold', style.className, className)}
      title={style.label}
      aria-label={style.label}
    >
      {style.letter}
    </span>
  );
}
