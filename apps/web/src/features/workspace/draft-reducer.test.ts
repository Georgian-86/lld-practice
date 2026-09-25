import { describe, expect, it } from 'vitest';
import type { Draft } from '@blueprint/shared';
import { emptyDesign } from '@blueprint/shared';
import { draftReducer, isMapped } from './draft-reducer';

function draftWith(names: string[]): Draft {
  let draft: Draft = { format: 'structured', design: emptyDesign() };
  names.forEach((name, i) => (draft = draftReducer(draft, { type: 'entity/add', id: `e${i}`, name })));
  return draft;
}

describe('draftReducer', () => {
  it('carries relationships, traceability and patterns across a rename', () => {
    let d = draftWith(['Lot', 'Floor']);
    d = draftReducer(d, { type: 'relationship/add', relationship: { id: 'r', from: 'Lot', to: 'Floor', type: 'composition' } });
    d = draftReducer(d, { type: 'trace/toggle', requirementId: 'FR-1', entityName: 'Floor' });
    d = draftReducer(d, { type: 'pattern/add', id: 'p' });
    d = draftReducer(d, { type: 'pattern/update', id: 'p', patch: { appliedTo: ['Floor'] } });
    d = draftReducer(d, { type: 'entity/rename', id: 'e1', name: 'Level' });
    expect(d.design.relationships[0]).toMatchObject({ from: 'Lot', to: 'Level' });
    expect(d.design.requirementMap['FR-1']).toEqual(['Level']);
    expect(d.design.patterns[0]!.appliedTo).toEqual(['Level']);
  });

  it('does not hijack another class’s references when names collide mid-typing', () => {
    let d = draftWith(['Car', 'Ca']);
    d = draftReducer(d, { type: 'relationship/add', relationship: { id: 'r', from: 'Car', to: 'Ca', type: 'association' } });
    // Typing "Car" into the second class must not merge it with the first...
    d = draftReducer(d, { type: 'entity/rename', id: 'e1', name: 'Car' });
    // ...and continuing to "Cart" must not drag the first class's references along.
    d = draftReducer(d, { type: 'entity/rename', id: 'e1', name: 'Cart' });
    expect(d.design.relationships[0]).toMatchObject({ from: 'Car', to: 'Ca' });
  });

  it('removes a deleted class from relationships, traceability and patterns', () => {
    let d = draftWith(['Lot', 'Floor']);
    d = draftReducer(d, { type: 'relationship/add', relationship: { id: 'r', from: 'Lot', to: 'Floor', type: 'composition' } });
    d = draftReducer(d, { type: 'trace/toggle', requirementId: 'FR-1', entityName: 'Floor' });
    d = draftReducer(d, { type: 'entity/remove', id: 'e1' });
    expect(d.design.relationships).toEqual([]);
    expect(isMapped(d.design, 'FR-1')).toBe(false);
  });

  it('toggles traceability case-insensitively', () => {
    let d = draftWith(['Floor']);
    d = draftReducer(d, { type: 'trace/toggle', requirementId: 'FR-1', entityName: 'Floor' });
    expect(isMapped(d.design, 'FR-1')).toBe(true);
    d = draftReducer(d, { type: 'trace/toggle', requirementId: 'FR-1', entityName: 'floor' });
    expect(d.design.requirementMap['FR-1']).toEqual([]);
  });

  it('keeps written responsibilities when a Mermaid import replaces the diagram', () => {
    let d = draftWith(['Lot']);
    d = draftReducer(d, { type: 'entity/update', id: 'e0', patch: { responsibilities: ['runs the lot'] } });
    d = draftReducer(d, {
      type: 'diagram/replace',
      entities: [{ id: 'x', name: 'Lot', kind: 'class', responsibilities: [], attributes: [], methods: [] }],
      relationships: [],
    });
    expect(d.design.entities[0]!.responsibilities).toEqual(['runs the lot']);
  });
});
