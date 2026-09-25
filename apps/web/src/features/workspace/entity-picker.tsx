import * as Dropdown from '@radix-ui/react-dropdown-menu';
import type { Entity } from '@blueprint/shared';
import { nameKey } from '@blueprint/shared';
import { Check, Plus, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { KindIcon } from './kind-icon';

/** Chips for the selected classes plus a dropdown to toggle more. */
export function EntityPicker({
  entities,
  selected,
  onToggle,
  addLabel = 'Map class',
  emptyHint = 'Add classes first',
}: {
  entities: Entity[];
  selected: string[];
  onToggle: (name: string) => void;
  addLabel?: string;
  emptyHint?: string;
}) {
  const named = entities.filter((e) => e.name.trim());
  const known = new Map(named.map((e) => [nameKey(e.name), e]));
  const isSelected = (name: string) => selected.some((s) => nameKey(s) === nameKey(name));

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {selected.map((name) => {
        const entity = known.get(nameKey(name));
        return (
          <span
            key={name}
            className={cn(
              'inline-flex h-7 items-center gap-1.5 rounded-md border pl-1.5 pr-1 text-[13px]',
              entity ? 'border-border bg-surface-2 text-fg' : 'border-danger/40 bg-danger-soft text-danger-soft-fg',
            )}
            title={entity ? undefined : 'This class no longer exists'}
          >
            {entity ? <KindIcon kind={entity.kind} className="size-4 text-[9px]" /> : null}
            {name}
            <button
              type="button"
              onClick={() => onToggle(name)}
              className="grid size-5 place-items-center rounded text-muted hover:bg-surface-3 hover:text-fg"
              aria-label={`Remove ${name}`}
            >
              <X className="size-3" />
            </button>
          </span>
        );
      })}
      <Dropdown.Root modal={false}>
        <Dropdown.Trigger asChild disabled={named.length === 0}>
          <button
            type="button"
            className="inline-flex h-7 items-center gap-1 rounded-md border border-dashed border-border-strong px-2 text-[13px] text-muted transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
            title={named.length === 0 ? emptyHint : undefined}
          >
            <Plus className="size-3.5" />
            {named.length === 0 ? emptyHint : addLabel}
          </button>
        </Dropdown.Trigger>
        <Dropdown.Portal>
          <Dropdown.Content
            align="start"
            sideOffset={4}
            className="scrollbar-thin z-50 max-h-72 min-w-56 overflow-y-auto rounded-lg border border-border bg-surface p-1 shadow-lg animate-fade-in"
          >
            {named.map((entity) => (
              <Dropdown.CheckboxItem
                key={entity.id}
                checked={isSelected(entity.name)}
                onCheckedChange={() => onToggle(entity.name)}
                onSelect={(e) => e.preventDefault()}
                className="flex h-8 cursor-pointer select-none items-center gap-2 rounded-md px-2 text-[13px] text-fg outline-none data-[highlighted]:bg-surface-2"
              >
                <KindIcon kind={entity.kind} className="size-4 text-[9px]" />
                <span className="flex-1 truncate">{entity.name}</span>
                <Dropdown.ItemIndicator>
                  <Check className="size-3.5 text-primary" />
                </Dropdown.ItemIndicator>
              </Dropdown.CheckboxItem>
            ))}
          </Dropdown.Content>
        </Dropdown.Portal>
      </Dropdown.Root>
    </div>
  );
}
