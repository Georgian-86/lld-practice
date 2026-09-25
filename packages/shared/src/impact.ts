import type { DesignModel, Entity, Relationship } from './design';
import { nameKey } from './design';

export type ImpactStatus = 'added' | 'modified' | 'unchanged' | 'removed';

export interface EntityImpact {
  /** Entity id in the *after* design (or the *before* design for removed classes). */
  id: string;
  name: string;
  status: ImpactStatus;
  /** Human-readable list of what changed, e.g. "+ method pay()". Empty unless modified. */
  changes: string[];
}

export type ImpactVerdict = 'none' | 'extended' | 'contained' | 'rippled';

export interface DesignImpact {
  entities: EntityImpact[];
  counts: Record<ImpactStatus, number>;
  verdict: ImpactVerdict;
  /** New classes that extend or implement an abstraction that already existed: the seams that paid off. */
  seams: { added: string; into: string }[];
}

type Design = Pick<DesignModel, 'entities' | 'relationships'>;

const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
const clean = (items: string[]) => new Set(items.map(norm).filter(Boolean));
const display = (items: string[], key: string) => items.find((i) => norm(i) === key)?.trim() ?? key;

/**
 * How a revision changed an existing design: which classes were added, which
 * existing classes had to change, and which were untouched.
 *
 * This is the practical test of the open/closed principle: a design with the
 * right seams absorbs a new requirement mostly by *adding* classes. A class
 * only counts as modified when its own code would change: its kind, name,
 * members, responsibilities, or the relationships it holds (outgoing). A new
 * class that implements an existing interface does not modify that interface.
 */
export function diffDesigns(before: Design, after: Design): DesignImpact {
  const named = (d: Design) => d.entities.filter((e) => e.name.trim());
  const beforeEntities = named(before);
  const afterEntities = named(after);
  const beforeById = new Map(beforeEntities.map((e) => [e.id, e]));
  const beforeByName = new Map(beforeEntities.map((e) => [nameKey(e.name), e]));

  // Match each class to its earlier self: same id first (renames keep ids), then same name.
  const match = new Map<string, Entity>();
  const used = new Set<string>();
  for (const e of afterEntities) {
    const prev = beforeById.get(e.id);
    if (prev && !used.has(prev.id)) {
      match.set(e.id, prev);
      used.add(prev.id);
    }
  }
  for (const e of afterEntities) {
    if (match.has(e.id)) continue;
    const prev = beforeByName.get(nameKey(e.name));
    if (prev && !used.has(prev.id)) {
      match.set(e.id, prev);
      used.add(prev.id);
    }
  }

  // Relationship ends resolved to a stable identity (the earlier class's id when it existed).
  const afterIdentity = new Map<string, string>();
  for (const e of afterEntities) afterIdentity.set(nameKey(e.name), match.get(e.id)?.id ?? `new:${nameKey(e.name)}`);
  const beforeIdentity = new Map(beforeEntities.map((e) => [nameKey(e.name), e.id]));
  const displayName = new Map<string, string>();
  for (const e of beforeEntities) displayName.set(e.id, e.name.trim());
  for (const e of afterEntities) displayName.set(afterIdentity.get(nameKey(e.name))!, e.name.trim());

  const outgoing = (rels: Relationship[], identity: Map<string, string>) => {
    const map = new Map<string, Set<string>>();
    for (const r of rels) {
      const from = identity.get(nameKey(r.from));
      const to = identity.get(nameKey(r.to));
      if (!from || !to) continue;
      if (!map.has(from)) map.set(from, new Set());
      map.get(from)!.add(`${r.type}>${to}`);
    }
    return map;
  };
  const beforeOut = outgoing(before.relationships, beforeIdentity);
  const afterOut = outgoing(after.relationships, afterIdentity);
  const describeRel = (key: string) => {
    const [type, to] = key.split('>') as [Relationship['type'], string];
    const target = displayName.get(to) ?? to.replace(/^new:/, '');
    const verb = { inheritance: 'extends', implementation: 'implements', composition: 'owns', aggregation: 'has', association: 'uses', dependency: 'depends on' }[type];
    return `${verb} ${target}`;
  };

  const result: EntityImpact[] = [];
  for (const e of afterEntities) {
    const prev = match.get(e.id);
    if (!prev) {
      result.push({ id: e.id, name: e.name.trim(), status: 'added', changes: [] });
      continue;
    }
    const changes: string[] = [];
    if (nameKey(prev.name) !== nameKey(e.name)) changes.push(`renamed from ${prev.name.trim()}`);
    if (prev.kind !== e.kind) changes.push(`${prev.kind} → ${e.kind}`);
    for (const [label, a, b] of [
      ['method', prev.methods, e.methods],
      ['attribute', prev.attributes, e.attributes],
      ['responsibility', prev.responsibilities, e.responsibilities],
    ] as const) {
      const was = clean(a);
      const now = clean(b);
      for (const k of now) if (!was.has(k)) changes.push(`+ ${label} ${display(b, k)}`);
      for (const k of was) if (!now.has(k)) changes.push(`− ${label} ${display(a, k)}`);
    }
    const was = beforeOut.get(prev.id) ?? new Set<string>();
    const now = afterOut.get(prev.id) ?? new Set<string>();
    for (const k of now) if (!was.has(k)) changes.push(`now ${describeRel(k)}`);
    for (const k of was) if (!now.has(k)) changes.push(`no longer ${describeRel(k)}`);
    result.push({ id: e.id, name: e.name.trim(), status: changes.length ? 'modified' : 'unchanged', changes });
  }
  for (const e of beforeEntities) {
    if (!used.has(e.id)) result.push({ id: e.id, name: e.name.trim(), status: 'removed', changes: [] });
  }

  const seams: DesignImpact['seams'] = [];
  for (const e of afterEntities) {
    if (match.has(e.id)) continue;
    for (const key of afterOut.get(afterIdentity.get(nameKey(e.name))!) ?? []) {
      const [type, to] = key.split('>') as [string, string];
      if ((type === 'inheritance' || type === 'implementation') && !to.startsWith('new:')) seams.push({ added: e.name.trim(), into: displayName.get(to) ?? to });
    }
  }

  const counts: Record<ImpactStatus, number> = { added: 0, modified: 0, unchanged: 0, removed: 0 };
  for (const r of result) counts[r.status]++;
  const touched = counts.modified + counts.removed;
  const verdict: ImpactVerdict =
    counts.added === 0 && touched === 0 ? 'none' : touched === 0 ? 'extended' : touched <= 2 ? 'contained' : 'rippled';
  return { entities: result, counts, verdict, seams };
}

export const IMPACT_VERDICT_TEXT: Record<ImpactVerdict, { title: string; body: string }> = {
  none: { title: 'No structural change', body: 'The classes and their relationships are the same as in the previous version.' },
  extended: {
    title: 'Absorbed by extension',
    body: 'Every existing class stayed untouched. The change was handled by adding new classes, which is the open/closed principle at work.',
  },
  contained: {
    title: 'Contained change',
    body: 'The change touched one or two existing classes. That is usually the wiring point, so check that nothing else had to know about it.',
  },
  rippled: {
    title: 'The change rippled',
    body: 'Several existing classes had to change. A seam (an interface or a strategy) at the point that varies would let the next change land in new classes instead.',
  },
};

/** The curveball a challenge refers to (older drafts without an id mean the first one). */
export function curveballFor<C extends { id: string }>(curveballs: C[], id: string | undefined): C | undefined {
  return (id && curveballs.find((c) => c.id === id)) || curveballs[0];
}

/** What a challenge asks: its own generated text, or the deck entry it names. */
export function challengeCurveball<C extends { id: string; title: string; prompt: string }>(
  curveballs: C[],
  challenge: { curveballId?: string; custom?: { title: string; prompt: string } } | undefined,
): { title: string; prompt: string } | undefined {
  if (!challenge) return undefined;
  return challenge.custom ?? curveballFor(curveballs, challenge.curveballId);
}
