import type { DesignModel, Entity, EntityKind } from '@blueprint/shared';
import { ENTITY_KINDS, nameKey } from '@blueprint/shared';
import { Boxes, Copy, Plus, Trash2 } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type Dispatch } from 'react';
import { Button } from '@/components/ui/button';
import { EmptyState, Label } from '@/components/ui/misc';
import { cn } from '@/lib/cn';
import { newId } from '@/lib/format';
import { nonBlank, type DraftAction } from './draft-reducer';
import { KIND_LABELS, KindIcon } from './kind-icon';
import { LinesField } from './lines-field';

export function ClassesPanel({ design, dispatch, focus }: { design: DesignModel; dispatch: Dispatch<DraftAction>; focus?: string | null }) {
  const focused = focus ? design.entities.find((e) => nameKey(e.name) === nameKey(focus)) : undefined;
  const [selectedId, setSelectedId] = useState<string | null>(focused?.id ?? design.entities[0]?.id ?? null);
  useEffect(() => {
    if (focused) setSelectedId(focused.id);
    // Only react to a new deep link, not to edits of the focused entity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);
  const [focusNameOf, setFocusNameOf] = useState<string | null>(null);
  const selected = design.entities.find((e) => e.id === selectedId) ?? design.entities[0] ?? null;

  const duplicateNames = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of design.entities) if (e.name.trim()) counts.set(nameKey(e.name), (counts.get(nameKey(e.name)) ?? 0) + 1);
    return new Set([...counts].filter(([, n]) => n > 1).map(([k]) => k));
  }, [design.entities]);

  const add = (kind: EntityKind = 'class') => {
    const id = newId('e');
    dispatch({ type: 'entity/add', id, kind });
    setSelectedId(id);
    setFocusNameOf(id);
  };

  if (design.entities.length === 0) {
    return (
      <EmptyState
        className="py-20"
        icon={<Boxes className="size-5" />}
        title="Start with the nouns"
        description="Add the classes and interfaces your design needs. Give each one a clear responsibility — that is what reviewers look at first."
        action={
          <div className="flex gap-2">
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => add('class')}>
              Add class
            </Button>
            <Button icon={<Plus className="size-4" />} onClick={() => add('interface')}>
              Add interface
            </Button>
          </div>
        }
      />
    );
  }

  const usage = selected ? usageOf(design, selected.name) : null;

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[240px_1fr]">
      <div className="flex min-h-0 flex-col border-b border-border md:border-b-0 md:border-r">
        <div className="flex items-center justify-between gap-2 px-3 py-2.5">
          <span className="text-xs font-medium text-muted">{design.entities.length} classes & interfaces</span>
          <Button size="sm" variant="soft" icon={<Plus className="size-3.5" />} onClick={() => add()}>
            Add
          </Button>
        </div>
        <ul className="scrollbar-thin max-h-56 min-h-0 flex-1 overflow-y-auto px-2 pb-2 md:max-h-none" aria-label="Classes">
          {design.entities.map((e) => {
            const duplicate = e.name.trim() && duplicateNames.has(nameKey(e.name));
            const active = selected?.id === e.id;
            return (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(e.id)}
                  aria-current={active || undefined}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] transition',
                    active ? 'bg-primary-soft text-primary-soft-fg' : 'text-fg-2 hover:bg-surface-2',
                  )}
                >
                  <KindIcon kind={e.kind} />
                  <span className={cn('flex-1 truncate', !e.name.trim() && 'italic text-subtle')}>{e.name.trim() || 'Untitled'}</span>
                  {duplicate ? (
                    <span className="size-1.5 rounded-full bg-danger" title="Duplicate name" />
                  ) : nonBlank(e.responsibilities).length === 0 && e.kind !== 'enum' ? (
                    <span className="size-1.5 rounded-full bg-warning" title="No responsibilities yet" />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {selected && (
        <EntityEditor
          key={selected.id}
          entity={selected}
          dispatch={dispatch}
          autoFocusName={focusNameOf === selected.id}
          onFocused={() => setFocusNameOf(null)}
          duplicate={Boolean(selected.name.trim() && duplicateNames.has(nameKey(selected.name)))}
          usage={usage!}
          onDuplicate={() => {
            const id = newId('e');
            dispatch({ type: 'entity/add', id, name: `${selected.name}Copy`, kind: selected.kind });
            dispatch({
              type: 'entity/update',
              id,
              patch: { responsibilities: [...selected.responsibilities], attributes: [...selected.attributes], methods: [...selected.methods] },
            });
            setSelectedId(id);
            setFocusNameOf(id);
          }}
          onDelete={() => {
            const index = design.entities.findIndex((e) => e.id === selected.id);
            const next = design.entities[index + 1] ?? design.entities[index - 1] ?? null;
            dispatch({ type: 'entity/remove', id: selected.id });
            setSelectedId(next?.id ?? null);
          }}
        />
      )}
    </div>
  );
}

function usageOf(design: DesignModel, name: string) {
  const key = nameKey(name);
  if (!key) return { relationships: 0, requirements: 0 };
  return {
    relationships: design.relationships.filter((r) => nameKey(r.from) === key || nameKey(r.to) === key).length,
    requirements: Object.values(design.requirementMap).filter((names) => names.some((n) => nameKey(n) === key)).length,
  };
}

function EntityEditor({
  entity,
  dispatch,
  autoFocusName,
  onFocused,
  duplicate,
  usage,
  onDelete,
  onDuplicate,
}: {
  entity: Entity;
  dispatch: Dispatch<DraftAction>;
  autoFocusName: boolean;
  onFocused: () => void;
  duplicate: boolean;
  usage: { relationships: number; requirements: number };
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  const nameId = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocusName) {
      nameRef.current?.focus();
      onFocused();
    }
  }, [autoFocusName, onFocused]);

  const update = (patch: Partial<Omit<Entity, 'id' | 'name'>>) => dispatch({ type: 'entity/update', id: entity.id, patch });
  const invalidName = entity.name.trim() !== '' && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(entity.name.trim());

  return (
    <div className="scrollbar-thin min-h-0 overflow-y-auto p-5">
      <div className="mx-auto max-w-2xl space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto]">
          <div>
            <Label htmlFor={nameId}>Name</Label>
            <input
              id={nameId}
              ref={nameRef}
              value={entity.name}
              onChange={(e) => dispatch({ type: 'entity/rename', id: entity.id, name: e.target.value })}
              placeholder="e.g. ParkingSpot"
              className={cn('field font-medium', (duplicate || invalidName) && 'border-danger focus:border-danger')}
              autoComplete="off"
              spellCheck={false}
              maxLength={80}
              aria-invalid={duplicate || invalidName || undefined}
            />
            {duplicate ? (
              <p className="mt-1.5 text-xs text-danger">Another class already has this name.</p>
            ) : invalidName ? (
              <p className="mt-1.5 text-xs text-warning-soft-fg">Use PascalCase without spaces, e.g. ParkingSpot.</p>
            ) : null}
          </div>
          <div>
            <Label>Kind</Label>
            <div className="inline-flex rounded-lg border border-border bg-surface-2 p-0.5" role="radiogroup" aria-label="Kind">
              {ENTITY_KINDS.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  role="radio"
                  aria-checked={entity.kind === kind}
                  onClick={() => update({ kind })}
                  className={cn(
                    'h-8 rounded-md px-2.5 text-[13px] font-medium transition',
                    entity.kind === kind ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg',
                  )}
                >
                  {KIND_LABELS[kind].replace(' class', '')}
                </button>
              ))}
            </div>
          </div>
        </div>

        <LinesField
          label="Responsibilities"
          value={entity.responsibilities}
          onChange={(responsibilities) => update({ responsibilities })}
          placeholder={
            entity.kind === 'interface'
              ? 'What contract does this define? One per line, e.g.\nCalculates the fee for a ticket'
              : 'What is this class responsible for? One per line, e.g.\nTracks which spots on this floor are free'
          }
        />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <LinesField
            label={entity.kind === 'enum' ? 'Values' : 'Attributes'}
            value={entity.attributes}
            onChange={(attributes) => update({ attributes })}
            placeholder={entity.kind === 'enum' ? 'One per line, e.g.\nCOMPACT' : 'One per line, e.g.\nfloors: List<Floor>'}
            mono
          />
          <LinesField
            label="Methods"
            value={entity.methods}
            onChange={(methods) => update({ methods })}
            placeholder={entity.kind === 'enum' ? 'Optional' : 'One per line, e.g.\npark(vehicle): Ticket'}
            mono
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <p className="text-xs text-muted">
            Used in {usage.relationships} {usage.relationships === 1 ? 'relationship' : 'relationships'} and mapped to{' '}
            {usage.requirements} {usage.requirements === 1 ? 'requirement' : 'requirements'}.
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" icon={<Copy className="size-3.5" />} onClick={onDuplicate}>
              Duplicate
            </Button>
            <Button size="sm" variant="danger" icon={<Trash2 className="size-3.5" />} onClick={onDelete}>
              Delete
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
