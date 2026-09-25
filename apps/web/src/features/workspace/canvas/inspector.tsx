import type { DesignModel, Entity, Finding, ProblemDTO, Relationship, RelationshipType } from '@blueprint/shared';
import { nameKey } from '@blueprint/shared';
import { AlertTriangle, ArrowLeftRight, CheckCircle2, CircleDot, Info, Loader2, MousePointerClick, Trash2, X } from 'lucide-react';
import { useId, type Dispatch } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/misc';
import { cn } from '@/lib/cn';
import { newId } from '@/lib/format';
import { EntityEditor } from '../classes-panel';
import type { DraftAction } from '../draft-reducer';
import { RELATIONSHIP_ORDER, RelationshipGlyph, UML } from './uml';

interface InspectorProps {
  problem: ProblemDTO;
  design: DesignModel;
  dispatch?: Dispatch<DraftAction>;
  entity?: Entity;
  relationship?: Relationship;
  findings?: Finding[] | null;
  checking?: boolean;
  autoFocusName: boolean;
  onFocused: () => void;
  onFocusEntity: (name: string) => void;
  onClose: () => void;
  /** Replaces the default content (e.g. the scenario panel). */
  children?: React.ReactNode;
}

/** Right-hand panel: edits the selection, or lists live checks when nothing is selected. */
export function CanvasInspector(props: InspectorProps) {
  const { entity, relationship, dispatch } = props;
  return (
    <aside className="hidden w-[320px] shrink-0 flex-col border-l border-border bg-surface md:flex xl:w-[360px]" aria-label="Inspector">
      {props.children ? (
        props.children
      ) : entity ? (
        <EntityInspector {...props} entity={entity} />
      ) : relationship && dispatch ? (
        <RelationshipInspector relationship={relationship} dispatch={dispatch} design={props.design} onClose={props.onClose} />
      ) : (
        <ChecksPanel findings={props.findings} checking={props.checking} readOnly={!dispatch} onFocusEntity={props.onFocusEntity} empty={props.design.entities.length === 0} />
      )}
    </aside>
  );
}

function Header({ title, subtitle, onClose }: { title: string; subtitle?: string; onClose?: () => void }) {
  return (
    <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border px-4">
      <div className="min-w-0">
        <div className="truncate text-[13px] font-semibold text-fg">{title}</div>
        {subtitle && <div className="truncate text-[11.5px] text-muted">{subtitle}</div>}
      </div>
      {onClose && (
        <button type="button" onClick={onClose} className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-fg" aria-label="Close inspector">
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}

function EntityInspector({ problem, design, dispatch, entity, findings, autoFocusName, onFocused, onClose }: InspectorProps & { entity: Entity }) {
  const key = nameKey(entity.name);
  const issues = (findings ?? []).filter(
    (f) => f.kind !== 'strength' && f.severity !== 'info' && (f.evidence.entities ?? []).some((n) => nameKey(n) === key),
  );
  const duplicate = Boolean(key) && design.entities.filter((e) => nameKey(e.name) === key).length > 1;
  const usage = {
    relationships: key ? design.relationships.filter((r) => nameKey(r.from) === key || nameKey(r.to) === key).length : 0,
    requirements: key ? Object.values(design.requirementMap).filter((names) => names.some((n) => nameKey(n) === key)).length : 0,
  };
  const requirements = [...problem.functionalRequirements, ...problem.nonFunctionalRequirements];

  if (!dispatch) {
    // Read-only (feedback report): show what the reviewer said about this class.
    return (
      <>
        <Header title={entity.name || 'Unnamed'} subtitle={`${issues.length} issue${issues.length === 1 ? '' : 's'} on this class`} onClose={onClose} />
        <FindingList findings={issues} emptyText="No issues were raised about this class." />
      </>
    );
  }

  return (
    <>
      <Header title={entity.name.trim() || 'Unnamed class'} subtitle="Double-click a class to edit it here" onClose={onClose} />
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        {issues.length > 0 && (
          <div className="border-b border-border p-3">
            <FindingList findings={issues} compact />
          </div>
        )}
        <EntityEditor
          key={entity.id}
          entity={entity}
          dispatch={dispatch}
          autoFocusName={autoFocusName}
          onFocused={onFocused}
          duplicate={duplicate}
          usage={usage}
          compact
          onDuplicate={() => {
            const id = newId('e');
            dispatch({ type: 'entity/add', id, name: `${entity.name}Copy`, kind: entity.kind });
            dispatch({ type: 'entity/update', id, patch: { responsibilities: [...entity.responsibilities], attributes: [...entity.attributes], methods: [...entity.methods] } });
          }}
          onDelete={() => {
            dispatch({ type: 'entity/remove', id: entity.id });
            onClose();
          }}
        />
        <div className="border-t border-border p-4">
          <Label>Requirements this class owns</Label>
          {!entity.name.trim() ? (
            <p className="text-xs text-muted">Name the class first.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {requirements.map((r) => {
                const on = (design.requirementMap[r.id] ?? []).some((n) => nameKey(n) === key);
                return (
                  <button
                    key={r.id}
                    type="button"
                    title={r.text}
                    aria-pressed={on}
                    onClick={() => dispatch({ type: 'trace/toggle', requirementId: r.id, entityName: entity.name.trim() })}
                    className={cn(
                      'inline-flex h-7 items-center gap-1 rounded-md border px-2 font-mono text-[11.5px] font-medium transition',
                      on ? 'border-success/30 bg-success-soft text-success-soft-fg' : 'border-dashed border-border-strong text-muted hover:border-primary hover:text-primary',
                    )}
                  >
                    {on && <CheckCircle2 className="size-3" />}
                    {r.id}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function RelationshipInspector({
  relationship: r,
  dispatch,
  design,
  onClose,
}: {
  relationship: Relationship;
  dispatch: Dispatch<DraftAction>;
  design: DesignModel;
  onClose: () => void;
}) {
  const labelId = useId();
  const multId = useId();
  const update = (patch: Partial<Omit<Relationship, 'id'>>) => dispatch({ type: 'relationship/update', id: r.id, patch });
  const names = design.entities.map((e) => e.name.trim()).filter(Boolean);
  return (
    <>
      <Header title="Relationship" subtitle={`${r.from} ${UML[r.type].verb} ${r.to}`} onClose={onClose} />
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 scrollbar-thin">
        <div className="flex items-center gap-2">
          <select value={r.from} onChange={(e) => update({ from: e.target.value })} className="field h-9 min-w-0 flex-1 py-0" aria-label="From">
            {names.map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
          <Button size="icon" variant="ghost" onClick={() => update({ from: r.to, to: r.from })} aria-label="Swap direction" title="Swap direction">
            <ArrowLeftRight className="size-4" />
          </Button>
          <select value={r.to} onChange={(e) => update({ to: e.target.value })} className="field h-9 min-w-0 flex-1 py-0" aria-label="To">
            {names.map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </div>
        <div>
          <Label>Type</Label>
          <div role="radiogroup" aria-label="Relationship type" className="space-y-1">
            {RELATIONSHIP_ORDER.map((t: RelationshipType) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={r.type === t}
                onClick={() => update({ type: t })}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition',
                  r.type === t ? 'border-primary bg-primary-soft' : 'border-transparent hover:bg-surface-2',
                )}
              >
                <RelationshipGlyph type={t} className={r.type === t ? 'text-primary' : 'text-fg-2'} />
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-fg">
                    {r.from} <span className="text-primary">{UML[t].verb}</span> {r.to}
                  </div>
                  <div className="text-[11.5px] text-muted">{UML[t].help}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-[1fr_96px] gap-2">
          <div>
            <Label htmlFor={labelId}>Label</Label>
            <input id={labelId} value={r.label ?? ''} onChange={(e) => update({ label: e.target.value || undefined })} placeholder="e.g. has" className="field h-9" maxLength={60} />
          </div>
          <div>
            <Label htmlFor={multId}>Multiplicity</Label>
            <input id={multId} value={r.multiplicity ?? ''} onChange={(e) => update({ multiplicity: e.target.value || undefined })} placeholder="1..*" className="field h-9 font-mono text-[13px]" maxLength={20} />
          </div>
        </div>
        <Button
          variant="danger"
          size="sm"
          icon={<Trash2 className="size-3.5" />}
          onClick={() => {
            dispatch({ type: 'relationship/remove', id: r.id });
            onClose();
          }}
        >
          Delete relationship
        </Button>
      </div>
    </>
  );
}

function ChecksPanel({
  findings,
  checking,
  readOnly,
  onFocusEntity,
  empty,
}: {
  findings?: Finding[] | null;
  checking?: boolean;
  readOnly: boolean;
  onFocusEntity: (name: string) => void;
  empty: boolean;
}) {
  const issues = (findings ?? []).filter((f) => f.kind !== 'strength' && f.severity !== 'info');
  const strengths = (findings ?? []).filter((f) => f.kind === 'strength');
  return (
    <>
      <Header
        title={readOnly ? 'Findings on this diagram' : 'Live design checks'}
        subtitle={readOnly ? 'Select a class to see what was said about it' : 'The same rules that score your submission'}
      />
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        {!readOnly && empty ? (
          <div className="space-y-3 p-4 text-[13px] text-fg-2">
            <Tip>Add classes from the toolbar at the top-left of the canvas.</Tip>
            <Tip>Hover a class and drag from its edge dot to another class to connect them. Pick the kind of link under “Connect as”.</Tip>
            <Tip>Drag a requirement chip (FR-1…) onto the class that owns it.</Tip>
            <Tip>Double-click a class to edit its name, responsibilities and members.</Tip>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 border-b border-border px-4 py-2.5 text-xs text-muted">
              {checking ? (
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 className="size-3.5 animate-spin" /> Checking…
                </span>
              ) : (
                <>
                  <span>
                    <span className="font-semibold text-fg">{issues.length}</span> to improve
                  </span>
                  <span>
                    <span className="font-semibold text-success">{strengths.length}</span> strengths
                  </span>
                </>
              )}
            </div>
            <FindingList findings={issues} onFocusEntity={onFocusEntity} emptyText={findings ? 'No issues found by the design checks.' : 'Checks run as you draw.'} />
            {strengths.length > 0 && (
              <div className="border-t border-border p-3">
                <div className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Strengths</div>
                <ul className="space-y-1.5">
                  {strengths.map((f) => (
                    <li key={f.fingerprint} className="flex gap-2 px-1 text-[12.5px] text-fg-2">
                      <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" />
                      {f.title}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex gap-2">
      <MousePointerClick className="mt-0.5 size-3.5 shrink-0 text-primary" />
      <span>{children}</span>
    </p>
  );
}

function FindingList({
  findings,
  onFocusEntity,
  emptyText,
  compact = false,
}: {
  findings: Finding[];
  onFocusEntity?: (name: string) => void;
  emptyText?: string;
  compact?: boolean;
}) {
  if (findings.length === 0) return emptyText ? <p className="p-4 text-[13px] text-muted">{emptyText}</p> : null;
  return (
    <ul className={cn('space-y-1', compact ? '' : 'p-2')}>
      {findings.map((f) => {
        const Icon = f.severity === 'critical' || f.severity === 'major' ? AlertTriangle : f.severity === 'minor' ? CircleDot : Info;
        const target = f.evidence.entities?.[0];
        const content = (
          <>
            <Icon className={cn('mt-0.5 size-3.5 shrink-0', f.severity === 'critical' || f.severity === 'major' ? 'text-warning' : 'text-muted')} />
            <span className="min-w-0">
              <span className="block text-[12.5px] font-medium text-fg">{f.title}</span>
              {!compact && <span className="mt-0.5 block text-[11.5px] leading-snug text-muted">{f.suggestion ?? f.message}</span>}
            </span>
          </>
        );
        return (
          <li key={`${f.source}-${f.fingerprint}`}>
            {onFocusEntity && target ? (
              <button type="button" onClick={() => onFocusEntity(target)} className="flex w-full gap-2 rounded-md px-2 py-1.5 text-left hover:bg-surface-2">
                {content}
              </button>
            ) : (
              <div className="flex gap-2 rounded-md px-2 py-1.5">{content}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
