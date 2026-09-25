import type { DesignModel, ProblemDTO, Requirement } from '@blueprint/shared';
import { CheckCircle2, Circle } from 'lucide-react';
import { useEffect, type Dispatch } from 'react';
import { Meter } from '@/components/ui/score';
import { SectionTitle } from '@/components/ui/misc';
import { cn } from '@/lib/cn';
import { isMapped, type DraftAction } from './draft-reducer';
import { EntityPicker } from './entity-picker';

export function TraceabilityPanel({
  problem,
  design,
  dispatch,
  focus,
}: {
  problem: ProblemDTO;
  design: DesignModel;
  dispatch: Dispatch<DraftAction>;
  focus?: string | null;
}) {
  const functional = problem.functionalRequirements;
  useEffect(() => {
    if (focus) document.getElementById(`req-${focus}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [focus]);
  const mapped = functional.filter((r) => isMapped(design, r.id)).length;

  const row = (requirement: Requirement, tone: 'primary' | 'info') => {
    const done = isMapped(design, requirement.id);
    return (
      <li
        key={requirement.id}
        id={`req-${requirement.id}`}
        className={cn(
          'scroll-mt-4 rounded-xl border border-border bg-surface p-4 shadow-xs transition-shadow',
          focus === requirement.id && 'border-primary ring-4 ring-ring',
        )}
      >
        <div className="flex gap-3">
          {done ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" /> : <Circle className="mt-0.5 size-4 shrink-0 text-subtle" />}
          <div className="min-w-0 flex-1">
            <p className="text-[13px] leading-relaxed text-fg-2">
              <span
                className={cn(
                  'mr-2 rounded px-1.5 py-0.5 font-mono text-[11px] font-medium',
                  tone === 'primary' ? 'bg-primary-soft text-primary-soft-fg' : 'bg-info-soft text-info-soft-fg',
                )}
              >
                {requirement.id}
              </span>
              {requirement.text}
            </p>
            <div className="mt-3">
              <EntityPicker
                entities={design.entities}
                selected={design.requirementMap[requirement.id] ?? []}
                onToggle={(entityName) => dispatch({ type: 'trace/toggle', requirementId: requirement.id, entityName })}
              />
            </div>
          </div>
        </div>
      </li>
    );
  };

  return (
    <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-5">
      <div className="mx-auto max-w-3xl">
        <div className="mb-5 rounded-xl border border-border bg-surface p-4">
          <div className="mb-2 flex items-baseline justify-between">
            <p className="text-[13px] font-medium text-fg">
              {mapped} of {functional.length} functional requirements have an owner
            </p>
            <span className="text-xs text-muted">{Math.round((mapped / functional.length) * 100)}%</span>
          </div>
          <Meter value={(mapped / functional.length) * 100} tone={mapped === functional.length ? 'success' : 'primary'} label="Requirements with an owner" />
          <p className="mt-3 text-xs leading-relaxed text-muted">
            For each requirement, pick the classes that are responsible for it. If none fits, that usually means a class is missing.
          </p>
        </div>
        <SectionTitle className="mb-2">Functional</SectionTitle>
        <ul className="space-y-3">{functional.map((r) => row(r, 'primary'))}</ul>
        {problem.nonFunctionalRequirements.length > 0 && (
          <>
            <SectionTitle className="mb-2 mt-6">Non-functional</SectionTitle>
            <ul className="space-y-3">{problem.nonFunctionalRequirements.map((r) => row(r, 'info'))}</ul>
          </>
        )}
      </div>
    </div>
  );
}
