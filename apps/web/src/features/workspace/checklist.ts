import type { DesignModel, ProblemDTO } from '@blueprint/shared';
import { nameKey } from '@blueprint/shared';
import { isMapped, nonBlank } from './draft-reducer';

export type CheckLevel = 'ok' | 'warn' | 'block';

export interface Check {
  id: string;
  level: CheckLevel;
  label: string;
  detail?: string;
  tab: 'classes' | 'relationships' | 'traceability' | 'patterns' | 'reasoning';
}

/**
 * Client-side readiness checks shown before submitting. Only "block" items
 * stop a submission (the server enforces the same rules); everything else is
 * a nudge, because weak designs deserve feedback, not rejection.
 */
export function readinessChecks(problem: ProblemDTO, design: DesignModel): Check[] {
  const named = design.entities.filter((e) => e.name.trim());
  const unnamed = design.entities.length - named.length;
  const keys = named.map((e) => nameKey(e.name));
  const duplicates = [...new Set(keys.filter((k, i) => keys.indexOf(k) !== i))];
  const withoutJob = named.filter((e) => e.kind !== 'enum' && nonBlank(e.responsibilities).length === 0 && nonBlank(e.methods).length === 0);
  const mapped = problem.functionalRequirements.filter((r) => isMapped(design, r.id)).length;
  const total = problem.functionalRequirements.length;
  const tradeOffs = nonBlank(design.tradeOffs).length;

  const checks: Check[] = [];
  checks.push(
    named.length < 2
      ? { id: 'classes', level: 'block', label: 'Add at least two named classes', tab: 'classes' }
      : { id: 'classes', level: 'ok', label: `${named.length} classes and interfaces`, tab: 'classes' },
  );
  if (unnamed) checks.push({ id: 'unnamed', level: 'block', label: `${unnamed} class${unnamed === 1 ? ' has' : 'es have'} no name`, tab: 'classes' });
  if (duplicates.length) checks.push({ id: 'dupes', level: 'block', label: 'Class names must be unique', detail: duplicates.join(', '), tab: 'classes' });
  if (named.length >= 2) {
    checks.push(
      withoutJob.length
        ? { id: 'jobs', level: 'warn', label: `${withoutJob.length} class${withoutJob.length === 1 ? ' has' : 'es have'} no responsibilities`, detail: withoutJob.map((e) => e.name).slice(0, 4).join(', '), tab: 'classes' }
        : { id: 'jobs', level: 'ok', label: 'Every class has a responsibility', tab: 'classes' },
    );
  }
  checks.push(
    design.relationships.length === 0
      ? { id: 'rels', level: 'warn', label: 'No relationships yet', tab: 'relationships' }
      : { id: 'rels', level: 'ok', label: `${design.relationships.length} relationships`, tab: 'relationships' },
  );
  checks.push({
    id: 'trace',
    level: mapped === total ? 'ok' : 'warn',
    label: `${mapped} of ${total} requirements have an owner`,
    tab: 'traceability',
  });
  checks.push(
    tradeOffs === 0
      ? { id: 'tradeoffs', level: 'warn', label: 'No trade-offs written', tab: 'reasoning' }
      : { id: 'tradeoffs', level: 'ok', label: `${tradeOffs} trade-off${tradeOffs === 1 ? '' : 's'}`, tab: 'reasoning' },
  );
  checks.push(
    design.extensionAnswer.trim()
      ? { id: 'ext', level: 'ok', label: 'Extension scenario answered', tab: 'reasoning' }
      : { id: 'ext', level: 'warn', label: 'Extension scenario not answered', tab: 'reasoning' },
  );
  return checks;
}
