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

  it('stores a position when a class is added on the canvas, and forgets it when the class is deleted', () => {
    let d: Draft = { format: 'structured', design: emptyDesign() };
    d = draftReducer(d, { type: 'entity/add', id: 'a', name: 'Lot', position: { x: 10, y: 20 } });
    expect(d.layout).toEqual({ a: { x: 10, y: 20 } });
    d = draftReducer(d, { type: 'layout/set', positions: { a: { x: 50, y: 60 } } });
    expect(d.layout?.a).toEqual({ x: 50, y: 60 });
    d = draftReducer(d, { type: 'entity/remove', id: 'a' });
    expect(d.layout).toEqual({});
  });

  it('merges layout updates by default and replaces them on auto-layout', () => {
    let d: Draft = { format: 'structured', design: emptyDesign(), layout: { a: { x: 0, y: 0 } } };
    d = draftReducer(d, { type: 'layout/set', positions: { b: { x: 1, y: 1 } } });
    expect(Object.keys(d.layout!)).toEqual(['a', 'b']);
    d = draftReducer(d, { type: 'layout/set', positions: { c: { x: 2, y: 2 } }, replace: true });
    expect(Object.keys(d.layout!)).toEqual(['c']);
  });
});


describe('curveball challenge', () => {
  it('sets and clears the challenge without touching the design', () => {
    const start = draftWith(['A']);
    const challenge = { kind: 'curveball' as const, fromVersion: 1, acceptedAt: '2026-01-01T00:00:00Z' };
    const withChallenge = draftReducer(start, { type: 'challenge/set', challenge });
    expect(withChallenge.challenge).toEqual(challenge);
    expect(withChallenge.design).toBe(start.design);
    const cleared = draftReducer(withChallenge, { type: 'challenge/set', challenge: undefined });
    expect('challenge' in cleared).toBe(false);
  });
});
