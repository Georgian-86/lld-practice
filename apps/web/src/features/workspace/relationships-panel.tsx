import type { DesignModel, RelationshipType } from '@blueprint/shared';
import { nameKey, RELATIONSHIP_TYPES } from '@blueprint/shared';
import { AlertTriangle, ArrowRight, GitFork, Info, Plus, Trash2 } from 'lucide-react';
import type { Dispatch } from 'react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/misc';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/cn';
import { newId } from '@/lib/format';
import type { DraftAction } from './draft-reducer';

const TYPE_OPTIONS: Record<RelationshipType, { label: string; help: string }> = {
  association: { label: 'uses / knows', help: 'Association: From holds a reference to To.' },
  dependency: { label: 'depends on', help: 'Dependency: From uses To briefly (parameter, local, return type).' },
  aggregation: { label: 'has (shared)', help: 'Aggregation: From groups To, but To can outlive it.' },
  composition: { label: 'owns', help: 'Composition: From owns To; To’s lifecycle is bound to From.' },
  inheritance: { label: 'extends', help: 'Inheritance: From is a subclass of To.' },
  implementation: { label: 'implements', help: 'Implementation: From implements interface To.' },
};

export function RelationshipsPanel({ design, dispatch }: { design: DesignModel; dispatch: Dispatch<DraftAction> }) {
  const names = design.entities.map((e) => e.name.trim()).filter(Boolean);
  const uniqueNames = [...new Map(names.map((n) => [nameKey(n), n])).values()];
  const known = new Set(uniqueNames.map(nameKey));

  const add = () => {
    const [from = '', to = ''] = uniqueNames;
    dispatch({ type: 'relationship/add', relationship: { id: newId('r'), from, to, type: 'association' } });
  };

  if (design.relationships.length === 0) {
    return (
      <EmptyState
        className="py-20"
        icon={<GitFork className="size-5" />}
        title="Connect your classes"
        description={
          uniqueNames.length < 2
            ? 'Add at least two named classes first, then describe how they collaborate.'
            : 'Who owns whom, who uses whom, and what extends what? Relationships are half of a class diagram.'
        }
        action={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={add} disabled={uniqueNames.length < 2}>
            Add relationship
          </Button>
        }
      />
    );
  }

  return (
    <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-5">
      <div className="mx-auto max-w-4xl">
        <div className="mb-4 flex items-start gap-2 rounded-lg bg-surface-2 px-3 py-2.5 text-xs leading-relaxed text-muted">
          <Info className="mt-px size-3.5 shrink-0" />
          <span>
            Read each row as a sentence: <span className="font-medium text-fg-2">ParkingLot owns Floor</span>,{' '}
            <span className="font-medium text-fg-2">Car extends Vehicle</span>,{' '}
            <span className="font-medium text-fg-2">HourlyPricing implements PricingStrategy</span>.
          </span>
        </div>

        <div className="hidden grid-cols-[1fr_150px_1fr_1fr_36px] gap-2 px-1 pb-2 text-xs font-medium text-muted md:grid">
          <span>From</span>
          <span>Relationship</span>
          <span>To</span>
          <span>Label / multiplicity (optional)</span>
          <span />
        </div>
        <ul className="space-y-2">
          {design.relationships.map((r) => {
            const dangling = [r.from, r.to].filter((n) => !known.has(nameKey(n)));
            const selfLoop = r.from && nameKey(r.from) === nameKey(r.to);
            return (
              <li
                key={r.id}
                className={cn(
                  'grid grid-cols-1 items-center gap-2 rounded-lg border bg-surface p-2 md:grid-cols-[1fr_150px_1fr_1fr_36px] md:border-transparent md:bg-transparent md:p-1',
                  dangling.length && 'md:border-danger/30 md:bg-danger-soft/40',
                )}
              >
                <NameSelect value={r.from} names={uniqueNames} onChange={(from) => dispatch({ type: 'relationship/update', id: r.id, patch: { from } })} label="From" />
                <Tooltip content={TYPE_OPTIONS[r.type].help}>
                  <select
                    value={r.type}
                    onChange={(e) => dispatch({ type: 'relationship/update', id: r.id, patch: { type: e.target.value as RelationshipType } })}
                    className="field h-9 py-0 font-medium"
                    aria-label="Relationship type"
                  >
                    {RELATIONSHIP_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {TYPE_OPTIONS[t].label}
                      </option>
                    ))}
                  </select>
                </Tooltip>
                <NameSelect value={r.to} names={uniqueNames} onChange={(to) => dispatch({ type: 'relationship/update', id: r.id, patch: { to } })} label="To" />
                <div className="flex gap-2">
                  <input
                    value={r.label ?? ''}
                    onChange={(e) => dispatch({ type: 'relationship/update', id: r.id, patch: { label: e.target.value || undefined } })}
                    placeholder="label"
                    className="field h-9 min-w-0"
                    aria-label="Label"
                    maxLength={60}
                  />
                  <input
                    value={r.multiplicity ?? ''}
                    onChange={(e) => dispatch({ type: 'relationship/update', id: r.id, patch: { multiplicity: e.target.value || undefined } })}
                    placeholder="1..*"
                    className="field h-9 w-20 shrink-0 font-mono text-[13px]"
                    aria-label="Multiplicity"
                    maxLength={20}
                  />
                </div>
                <div className="flex items-center justify-end gap-1">
                  {(dangling.length > 0 || selfLoop) && (
                    <Tooltip content={dangling.length ? `“${dangling.join('”, “')}” is not a class in your design.` : 'A class related to itself — intended?'}>
                      <AlertTriangle className={cn('size-4', dangling.length ? 'text-danger' : 'text-warning')} />
                    </Tooltip>
                  )}
                  <Button size="icon-sm" variant="ghost" onClick={() => dispatch({ type: 'relationship/remove', id: r.id })} aria-label="Remove relationship">
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
        <Button className="mt-3" size="sm" variant="soft" icon={<Plus className="size-3.5" />} onClick={add} disabled={uniqueNames.length < 2}>
          Add relationship
        </Button>
        <p className="mt-4 flex items-center gap-1.5 text-xs text-subtle">
          From <ArrowRight className="size-3" /> To reads left to right: child → parent, whole → part, user → used.
        </p>
      </div>
    </div>
  );
}

function NameSelect({ value, names, onChange, label }: { value: string; names: string[]; onChange: (v: string) => void; label: string }) {
  const known = names.some((n) => nameKey(n) === nameKey(value));
  return (
    <select value={known ? names.find((n) => nameKey(n) === nameKey(value)) : value} onChange={(e) => onChange(e.target.value)} className={cn('field h-9 py-0', !known && 'border-danger text-danger')} aria-label={label}>
      {!known && <option value={value}>{value ? `${value} (missing)` : 'Choose a class…'}</option>}
      {names.map((n) => (
        <option key={n} value={n}>
          {n}
        </option>
      ))}
    </select>
  );
}
