import type { Entity, EntityImpact, Finding } from '@blueprint/shared';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { AlertTriangle, CircleDot, Info } from 'lucide-react';
import { memo } from 'react';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/cn';
import { NODE_WIDTH } from './layout';

export type ClassNodeData = {
  entity: Entity;
  issues: Finding[];
  requirements: string[];
  readOnly: boolean;
  dropTarget: boolean;
  /** Scenario mode: the class the next call starts from, or one already in the walkthrough. */
  scenario?: 'caller' | 'in-flow' | 'idle';
  /** How a revision changed this class, when comparing versions. */
  impact?: EntityImpact;
};
export type ClassNodeType = Node<ClassNodeData, 'class'>;

const STEREOTYPE: Partial<Record<Entity['kind'], string>> = {
  interface: '«interface»',
  abstract: '«abstract»',
  enum: '«enumeration»',
};

const MAX_LINES = 6;

function Section({ items, placeholder, mono = true }: { items: string[]; placeholder: string; mono?: boolean }) {
  const lines = items.filter((s) => s.trim());
  return (
    <div className="border-t border-[var(--uml-border)] px-3 py-1.5">
      {lines.length === 0 ? (
        <div className="text-[11px] italic text-subtle">{placeholder}</div>
      ) : (
        <>
          {lines.slice(0, MAX_LINES).map((line, i) => (
            <div key={i} className={cn('truncate text-[11.5px] leading-[19px] text-fg-2', mono && 'font-mono')} title={line}>
              {line}
            </div>
          ))}
          {lines.length > MAX_LINES && <div className="text-[11px] text-subtle">+{lines.length - MAX_LINES} more</div>}
        </>
      )}
    </div>
  );
}

function IssueBadge({ issues }: { issues: Finding[] }) {
  if (issues.length === 0) return null;
  const worst = issues.some((f) => f.severity === 'critical' || f.severity === 'major') ? 'major' : issues.some((f) => f.severity === 'minor') ? 'minor' : 'info';
  const Icon = worst === 'major' ? AlertTriangle : worst === 'minor' ? CircleDot : Info;
  return (
    <Tooltip
      content={
        <ul className="space-y-1">
          {issues.slice(0, 5).map((f) => (
            <li key={f.fingerprint}>• {f.title}</li>
          ))}
          {issues.length > 5 && <li>+{issues.length - 5} more</li>}
        </ul>
      }
    >
      <span
        className={cn(
          'absolute -right-2.5 -top-2.5 z-10 inline-flex h-6 min-w-6 items-center justify-center gap-0.5 rounded-full px-1.5 text-[11px] font-semibold shadow-sm ring-2 ring-[var(--surface)]',
          worst === 'major' ? 'bg-warning text-white' : worst === 'minor' ? 'bg-fg-2 text-bg' : 'bg-info text-white',
        )}
        aria-label={`${issues.length} issue${issues.length === 1 ? '' : 's'}`}
      >
        <Icon className="size-3" />
        {issues.length}
      </span>
    </Tooltip>
  );
}

const handleClass = '!size-2.5 !rounded-full !border-2 !border-[var(--surface)] !bg-primary opacity-0 transition-opacity group-hover:opacity-100';

export const ClassNode = memo(function ClassNode({ data, selected }: NodeProps<ClassNodeType>) {
  const { entity, issues, requirements, readOnly, dropTarget, scenario, impact } = data;
  const name = entity.name.trim();
  return (
    <div
      className={cn(
        'group relative rounded-lg border bg-surface shadow-sm transition-shadow',
        'border-[var(--uml-border)]',
        selected && 'ring-2 ring-primary ring-offset-2 ring-offset-[var(--canvas-bg)]',
        dropTarget && 'ring-2 ring-success ring-offset-2 ring-offset-[var(--canvas-bg)]',
        scenario && 'cursor-pointer',
        scenario === 'caller' && 'ring-2 ring-ai ring-offset-2 ring-offset-[var(--canvas-bg)]',
        scenario === 'in-flow' && 'border-ai/60',
        impact?.status === 'added' && 'border-success border-2',
        impact?.status === 'modified' && 'border-warning border-2',
      )}
      style={{ width: NODE_WIDTH }}
    >
      {scenario === 'caller' ? (
        <span className="absolute -top-3 left-3 z-10 rounded-full bg-ai px-2 py-0.5 text-[10.5px] font-semibold text-white shadow-sm">calls next</span>
      ) : null}
      {!scenario && <IssueBadge issues={issues} />}
      {impact && impact.status !== 'unchanged' && <ImpactTag impact={impact} />}
      <div className={cn('rounded-t-lg px-3 py-2 text-center', entity.kind === 'interface' ? 'bg-ai-soft' : entity.kind === 'enum' ? 'bg-warning-soft' : 'bg-primary-soft')}>
        {STEREOTYPE[entity.kind] && <div className="text-[10.5px] font-medium leading-none text-muted">{STEREOTYPE[entity.kind]}</div>}
        <div className={cn('mt-0.5 truncate text-[13.5px] font-semibold text-fg', entity.kind === 'abstract' && 'italic', !name && 'italic text-subtle')}>
          {name || 'Unnamed'}
        </div>
      </div>
      <Section items={entity.attributes} placeholder={entity.kind === 'enum' ? 'no values' : 'no attributes'} />
      {entity.kind !== 'enum' && <Section items={entity.methods} placeholder="no methods" />}
      {requirements.length > 0 && (
        <div className="flex flex-wrap gap-1 border-t border-[var(--uml-border)] px-2.5 py-1.5">
          {requirements.map((r) => (
            <span key={r} className="rounded bg-success-soft px-1 font-mono text-[10px] font-medium text-success-soft-fg">
              {r}
            </span>
          ))}
        </div>
      )}
      {/* Handles are always rendered (React Flow needs them to draw edges); read-only canvases hide them. */}
      {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
        <Handle
          key={side}
          id={side}
          type="source"
          isConnectable={!readOnly}
          position={{ top: Position.Top, right: Position.Right, bottom: Position.Bottom, left: Position.Left }[side]}
          className={cn(handleClass, readOnly && '!invisible')}
        />
      ))}
    </div>
  );
});

function ImpactTag({ impact }: { impact: EntityImpact }) {
  const tag = (
    <span
      className={cn(
        'absolute -top-3 left-3 z-10 rounded-full px-2 py-0.5 text-[10.5px] font-semibold text-white shadow-sm',
        impact.status === 'added' ? 'bg-success' : 'bg-warning',
      )}
    >
      {impact.status === 'added' ? 'new' : `changed · ${impact.changes.length}`}
    </span>
  );
  if (impact.status !== 'modified') return tag;
  return (
    <Tooltip
      content={
        <ul className="space-y-0.5">
          {impact.changes.slice(0, 8).map((c) => (
            <li key={c}>{c}</li>
          ))}
          {impact.changes.length > 8 && <li>+{impact.changes.length - 8} more</li>}
        </ul>
      }
    >
      {tag}
    </Tooltip>
  );
}
