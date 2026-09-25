import type { DesignModel, Entity, Flow, FlowStep } from './design';
import { nameKey } from './design';

export type StepProblem =
  | { kind: 'unknown-class'; name: string }
  | { kind: 'not-navigable' }
  | { kind: 'unknown-method'; method: string };

export interface StepAnalysis {
  step: FlowStep;
  index: number;
  /** Can this call happen in code, given the relationships drawn? */
  navigable: boolean;
  problems: StepProblem[];
}

export interface FlowAnalysis {
  flow: Flow;
  steps: StepAnalysis[];
  valid: boolean;
  /** Steps whose caller is not the class that received the previous call (a break in the chain). */
  breaks: number[];
}

const PARENT_TYPES = new Set(['inheritance', 'implementation']);

function methodName(text: string): string {
  return text.trim().replace(/^[+\-#~]\s*/, '').split('(')[0]!.trim().toLowerCase();
}

/**
 * Deterministic check of a scenario walkthrough, shared by the canvas (live)
 * and the server (scoring) so both always agree.
 *
 * A call A → B is navigable when A holds any relationship towards B, or towards
 * an ancestor/interface of B (polymorphic call), or towards a subtype of B, or
 * when A calls itself or its own ancestor. Responses flow back along the call
 * chain, so they are not modelled as separate steps.
 */
export function analyseFlow(design: Pick<DesignModel, 'entities' | 'relationships'>, flow: Flow): FlowAnalysis {
  const byKey = new Map<string, Entity>();
  for (const e of design.entities) if (e.name.trim()) byKey.set(nameKey(e.name), e);

  const parents = new Map<string, Set<string>>();
  const knows = new Map<string, Set<string>>();
  for (const r of design.relationships) {
    const from = nameKey(r.from);
    const to = nameKey(r.to);
    if (!byKey.has(from) || !byKey.has(to)) continue;
    const target = PARENT_TYPES.has(r.type) ? parents : knows;
    if (!target.has(from)) target.set(from, new Set());
    target.get(from)!.add(to);
  }
  const ancestors = (key: string, seen = new Set<string>()): Set<string> => {
    for (const p of parents.get(key) ?? []) {
      if (!seen.has(p)) {
        seen.add(p);
        ancestors(p, seen);
      }
    }
    return seen;
  };
  // A class also knows whatever its ancestors know (inherited fields).
  const knownBy = (key: string): Set<string> => {
    const result = new Set(knows.get(key) ?? []);
    for (const a of ancestors(key)) for (const k of knows.get(a) ?? []) result.add(k);
    return result;
  };

  const steps: StepAnalysis[] = flow.steps.map((step, index) => {
    const problems: StepProblem[] = [];
    const fromKey = nameKey(step.from);
    const toKey = nameKey(step.to);
    const caller = byKey.get(fromKey);
    const callee = byKey.get(toKey);
    if (!caller) problems.push({ kind: 'unknown-class', name: step.from });
    if (!callee) problems.push({ kind: 'unknown-class', name: step.to });
    let navigable = false;
    if (caller && callee) {
      const calleeAncestors = ancestors(toKey);
      const known = knownBy(fromKey);
      navigable =
        fromKey === toKey ||
        ancestors(fromKey).has(toKey) ||
        known.has(toKey) ||
        [...calleeAncestors].some((a) => known.has(a)) ||
        [...known].some((k) => ancestors(k).has(toKey));
      if (!navigable) problems.push({ kind: 'not-navigable' });

      // Method check: the callee (or one of its ancestors) should declare the message.
      const wanted = methodName(step.message);
      const declaring = [callee, ...[...calleeAncestors].map((a) => byKey.get(a)!)];
      const declared = declaring.flatMap((e) => e.methods.map(methodName)).filter(Boolean);
      if (wanted && declared.length > 0 && !declared.includes(wanted)) {
        problems.push({ kind: 'unknown-method', method: wanted });
      }
    }
    return { step, index, navigable, problems };
  });

  const breaks: number[] = [];
  for (let i = 1; i < flow.steps.length; i++) {
    const prev = flow.steps[i - 1]!;
    const cur = flow.steps[i]!;
    // A new call must come from a class that is already part of the chain.
    const inChain = flow.steps.slice(0, i).some((s) => nameKey(s.to) === nameKey(cur.from) || nameKey(s.from) === nameKey(cur.from));
    if (!inChain && nameKey(prev.to) !== nameKey(cur.from)) breaks.push(i);
  }

  return {
    flow,
    steps,
    breaks,
    valid: steps.length > 0 && steps.every((s) => s.problems.length === 0) && breaks.length === 0,
  };
}

export function describeStepProblem(problem: StepProblem, step: FlowStep): string {
  switch (problem.kind) {
    case 'unknown-class':
      return `"${problem.name}" is not a class in the design.`;
    case 'not-navigable':
      return `${step.from} has no relationship to ${step.to}, so it cannot call it.`;
    case 'unknown-method':
      return `${step.to} does not declare ${problem.method}().`;
  }
}

/** Mermaid sequence diagram for a scenario. */
export function flowToMermaidSequence(flow: Flow): string {
  const safe = (n: string) => n.trim().replace(/[^A-Za-z0-9_]/g, '_') || '_';
  const lines = ['sequenceDiagram', '  autonumber'];
  const participants: string[] = [];
  for (const s of flow.steps) for (const n of [s.from, s.to]) if (!participants.includes(safe(n))) participants.push(safe(n));
  for (const p of participants) lines.push(`  participant ${p}`);
  for (const s of flow.steps) {
    const message = s.message.replace(/[;:#\r\n]/g, ' ').trim() || 'call';
    lines.push(`  ${safe(s.from)}->>${safe(s.to)}: ${message}`);
  }
  return lines.join('\n');
}
