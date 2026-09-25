import type { DesignModel, Draft, Entity, EntityKind, Flow, FlowStep, PatternUsage, Relationship } from '@blueprint/shared';
import { nameKey } from '@blueprint/shared';
import { newId } from '@/lib/format';

export type DraftAction =
  | { type: 'entity/add'; id: string; name?: string; kind?: EntityKind; position?: { x: number; y: number } }
  | { type: 'entity/update'; id: string; patch: Partial<Omit<Entity, 'id' | 'name'>> }
  | { type: 'entity/rename'; id: string; name: string }
  | { type: 'entity/remove'; id: string }
  | { type: 'relationship/add'; relationship: Relationship }
  | { type: 'relationship/update'; id: string; patch: Partial<Omit<Relationship, 'id'>> }
  | { type: 'relationship/remove'; id: string }
  | { type: 'trace/toggle'; requirementId: string; entityName: string }
  | { type: 'pattern/add'; id: string }
  | { type: 'pattern/update'; id: string; patch: Partial<Omit<PatternUsage, 'id'>> }
  | { type: 'pattern/remove'; id: string }
  | { type: 'text/set'; field: 'extensionAnswer' | 'notes'; value: string }
  | { type: 'tradeoffs/set'; value: string[] }
  | { type: 'diagram/replace'; entities: Entity[]; relationships: Relationship[] }
  | { type: 'layout/set'; positions: Record<string, { x: number; y: number }>; replace?: boolean }
  | { type: 'flow/add'; flow: Flow }
  | { type: 'flow/update'; id: string; patch: Partial<Pick<Flow, 'requirementId'>> }
  | { type: 'flow/remove'; id: string }
  | { type: 'flow/step-add'; flowId: string; step: FlowStep }
  | { type: 'flow/step-update'; flowId: string; stepId: string; patch: Partial<Omit<FlowStep, 'id'>> }
  | { type: 'flow/step-remove'; flowId: string; stepId: string };

function withDesign(draft: Draft, update: (design: DesignModel) => DesignModel): Draft {
  return { ...draft, design: update(draft.design) };
}

const replaceName = (names: string[], from: string, to: string) =>
  names.map((n) => (nameKey(n) === nameKey(from) ? to : n));

export function draftReducer(draft: Draft, action: DraftAction): Draft {
  switch (action.type) {
    case 'entity/add': {
      const next = withDesign(draft, (d) => ({
        ...d,
        entities: [
          ...d.entities,
          { id: action.id, name: action.name ?? '', kind: action.kind ?? 'class', responsibilities: [], attributes: [], methods: [] },
        ],
      }));
      return action.position ? { ...next, layout: { ...draft.layout, [action.id]: action.position } } : next;
    }

    case 'entity/update':
      return withDesign(draft, (d) => ({
        ...d,
        entities: d.entities.map((e) => (e.id === action.id ? { ...e, ...action.patch } : e)),
      }));

    case 'entity/rename':
      return withDesign(draft, (d) => {
        const target = d.entities.find((e) => e.id === action.id);
        if (!target) return d;
        const oldName = target.name;
        const others = d.entities.filter((e) => e.id !== action.id);
        // Only carry references across when both names unambiguously identify this entity;
        // otherwise a rename could silently re-point another class's relationships.
        const propagate =
          oldName.trim() !== '' &&
          !others.some((e) => nameKey(e.name) === nameKey(oldName)) &&
          !others.some((e) => nameKey(e.name) === nameKey(action.name)) &&
          action.name.trim() !== '';
        const entities = d.entities.map((e) => (e.id === action.id ? { ...e, name: action.name } : e));
        if (!propagate) return { ...d, entities };
        const to = action.name.trim();
        return {
          ...d,
          entities,
          relationships: d.relationships.map((r) => ({
            ...r,
            from: nameKey(r.from) === nameKey(oldName) ? to : r.from,
            to: nameKey(r.to) === nameKey(oldName) ? to : r.to,
          })),
          requirementMap: Object.fromEntries(
            Object.entries(d.requirementMap).map(([id, names]) => [id, replaceName(names, oldName, to)]),
          ),
          patterns: d.patterns.map((p) => ({ ...p, appliedTo: replaceName(p.appliedTo, oldName, to) })),
          flows: (d.flows ?? []).map((f) => ({
            ...f,
            steps: f.steps.map((st) => ({
              ...st,
              from: nameKey(st.from) === nameKey(oldName) ? to : st.from,
              to: nameKey(st.to) === nameKey(oldName) ? to : st.to,
            })),
          })),
        };
      });

    case 'entity/remove': {
      const { [action.id]: _removed, ...layout } = draft.layout ?? {};
      const next = withDesign(draft, (d) => {
        const target = d.entities.find((e) => e.id === action.id);
        if (!target) return d;
        const entities = d.entities.filter((e) => e.id !== action.id);
        const stillExists = entities.some((e) => nameKey(e.name) === nameKey(target.name));
        if (stillExists || !target.name.trim()) return { ...d, entities };
        const gone = (n: string) => nameKey(n) === nameKey(target.name);
        return {
          ...d,
          entities,
          relationships: d.relationships.filter((r) => !gone(r.from) && !gone(r.to)),
          requirementMap: Object.fromEntries(
            Object.entries(d.requirementMap).map(([id, names]) => [id, names.filter((n) => !gone(n))]),
          ),
          patterns: d.patterns.map((p) => ({ ...p, appliedTo: p.appliedTo.filter((n) => !gone(n)) })),
          flows: (d.flows ?? []).map((f) => ({ ...f, steps: f.steps.filter((st) => !gone(st.from) && !gone(st.to)) })),
        };
      });
      return draft.layout ? { ...next, layout } : next;
    }

    case 'relationship/add':
      return withDesign(draft, (d) => ({ ...d, relationships: [...d.relationships, action.relationship] }));

    case 'relationship/update':
      return withDesign(draft, (d) => ({
        ...d,
        relationships: d.relationships.map((r) => (r.id === action.id ? { ...r, ...action.patch } : r)),
      }));

    case 'relationship/remove':
      return withDesign(draft, (d) => ({ ...d, relationships: d.relationships.filter((r) => r.id !== action.id) }));

    case 'trace/toggle':
      return withDesign(draft, (d) => {
        const current = d.requirementMap[action.requirementId] ?? [];
        const has = current.some((n) => nameKey(n) === nameKey(action.entityName));
        const next = has ? current.filter((n) => nameKey(n) !== nameKey(action.entityName)) : [...current, action.entityName];
        return { ...d, requirementMap: { ...d.requirementMap, [action.requirementId]: next } };
      });

    case 'pattern/add':
      return withDesign(draft, (d) => ({
        ...d,
        patterns: [...d.patterns, { id: action.id, name: '', appliedTo: [], justification: '' }],
      }));

    case 'pattern/update':
      return withDesign(draft, (d) => ({
        ...d,
        patterns: d.patterns.map((p) => (p.id === action.id ? { ...p, ...action.patch } : p)),
      }));

    case 'pattern/remove':
      return withDesign(draft, (d) => ({ ...d, patterns: d.patterns.filter((p) => p.id !== action.id) }));

    case 'text/set':
      return withDesign(draft, (d) => ({ ...d, [action.field]: action.value }));

    case 'tradeoffs/set':
      return withDesign(draft, (d) => ({ ...d, tradeOffs: action.value }));

    case 'flow/add':
      return withDesign(draft, (d) => ({ ...d, flows: [...(d.flows ?? []), action.flow] }));

    case 'flow/update':
      return withDesign(draft, (d) => ({
        ...d,
        flows: (d.flows ?? []).map((f) => (f.id === action.id ? { ...f, ...action.patch } : f)),
      }));

    case 'flow/remove':
      return withDesign(draft, (d) => ({ ...d, flows: (d.flows ?? []).filter((f) => f.id !== action.id) }));

    case 'flow/step-add':
      return withDesign(draft, (d) => ({
        ...d,
        flows: (d.flows ?? []).map((f) => (f.id === action.flowId ? { ...f, steps: [...f.steps, action.step] } : f)),
      }));

    case 'flow/step-update':
      return withDesign(draft, (d) => ({
        ...d,
        flows: (d.flows ?? []).map((f) =>
          f.id === action.flowId ? { ...f, steps: f.steps.map((st) => (st.id === action.stepId ? { ...st, ...action.patch } : st)) } : f,
        ),
      }));

    case 'flow/step-remove':
      return withDesign(draft, (d) => ({
        ...d,
        flows: (d.flows ?? []).map((f) => (f.id === action.flowId ? { ...f, steps: f.steps.filter((st) => st.id !== action.stepId) } : f)),
      }));

    case 'layout/set':
      return { ...draft, layout: action.replace ? action.positions : { ...draft.layout, ...action.positions } };

    case 'diagram/replace': {
      // New ids → old positions no longer apply; the canvas auto-lays out the import.
      const next = withDesign(draft, (d) => {
        // Keep written responsibilities for classes that survive the import.
        const previous = new Map(d.entities.map((e) => [nameKey(e.name), e]));
        const entities = action.entities.map((e) => {
          const before = previous.get(nameKey(e.name));
          return {
            ...e,
            id: newId('e'),
            responsibilities: e.responsibilities.length ? e.responsibilities : before?.responsibilities ?? [],
          };
        });
        const relationships = action.relationships.map((r) => ({ ...r, id: newId('r') }));
        return { ...d, entities, relationships };
      });
      return { ...next, layout: {} };
    }
  }
}

/* ------------------------------ Derived facts ------------------------------ */

export const nonBlank = (items: string[]) => items.filter((s) => s.trim().length > 0);

export function isMapped(design: DesignModel, requirementId: string): boolean {
  const names = new Set(design.entities.map((e) => nameKey(e.name)).filter(Boolean));
  return (design.requirementMap[requirementId] ?? []).some((n) => names.has(nameKey(n)));
}
