import type { DesignModel } from '@blueprint/shared';
import { Plus, Puzzle, Trash2 } from 'lucide-react';
import { useId, type Dispatch } from 'react';
import { Button } from '@/components/ui/button';
import { EmptyState, Label } from '@/components/ui/misc';
import { AutoTextarea } from '@/components/ui/textarea';
import { newId } from '@/lib/format';
import type { DraftAction } from './draft-reducer';
import { EntityPicker } from './entity-picker';

const COMMON_PATTERNS = [
  'Strategy',
  'State',
  'Observer',
  'Factory Method',
  'Abstract Factory',
  'Builder',
  'Singleton',
  'Decorator',
  'Adapter',
  'Facade',
  'Command',
  'Chain of Responsibility',
  'Template Method',
  'Composite',
  'Repository',
];

export function PatternsPanel({ design, dispatch }: { design: DesignModel; dispatch: Dispatch<DraftAction> }) {
  const listId = useId();
  const add = () => dispatch({ type: 'pattern/add', id: newId('p') });

  if (design.patterns.length === 0) {
    return (
      <EmptyState
        className="py-20"
        icon={<Puzzle className="size-5" />}
        title="Name the patterns you used (optional)"
        description="Patterns aren’t required. But if a hierarchy exists so behaviour can be swapped, say which pattern it is and what change it protects against."
        action={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={add}>
            Add pattern
          </Button>
        }
      />
    );
  }

  return (
    <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-5">
      <datalist id={listId}>
        {COMMON_PATTERNS.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
      <div className="mx-auto max-w-3xl space-y-4">
        {design.patterns.map((pattern, index) => (
          <div key={pattern.id} className="rounded-xl border border-border bg-surface p-4 shadow-xs">
            <div className="mb-4 flex items-end gap-3">
              <div className="flex-1">
                <Label htmlFor={`${pattern.id}-name`}>Pattern {index + 1}</Label>
                <input
                  id={`${pattern.id}-name`}
                  list={listId}
                  value={pattern.name}
                  onChange={(e) => dispatch({ type: 'pattern/update', id: pattern.id, patch: { name: e.target.value } })}
                  placeholder="e.g. Strategy"
                  className="field font-medium"
                  maxLength={60}
                  autoComplete="off"
                />
              </div>
              <Button size="icon" variant="ghost" onClick={() => dispatch({ type: 'pattern/remove', id: pattern.id })} aria-label="Remove pattern">
                <Trash2 className="size-4" />
              </Button>
            </div>
            <Label>Participating classes</Label>
            <EntityPicker
              entities={design.entities}
              selected={pattern.appliedTo}
              addLabel="Add class"
              onToggle={(name) =>
                dispatch({
                  type: 'pattern/update',
                  id: pattern.id,
                  patch: {
                    appliedTo: pattern.appliedTo.some((n) => n.toLowerCase() === name.toLowerCase())
                      ? pattern.appliedTo.filter((n) => n.toLowerCase() !== name.toLowerCase())
                      : [...pattern.appliedTo, name],
                  },
                })
              }
            />
            <div className="mt-4">
              <Label htmlFor={`${pattern.id}-why`}>Why here?</Label>
              <AutoTextarea
                id={`${pattern.id}-why`}
                value={pattern.justification}
                onChange={(e) => dispatch({ type: 'pattern/update', id: pattern.id, patch: { justification: e.target.value } })}
                placeholder="Without this pattern, adding ___ would require changing ___."
                minRows={2}
              />
            </div>
          </div>
        ))}
        <Button size="sm" variant="soft" icon={<Plus className="size-3.5" />} onClick={add}>
          Add pattern
        </Button>
      </div>
    </div>
  );
}
