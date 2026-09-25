import { describe, expect, it } from 'vitest';
import type { DesignModel, Flow, RelationshipType } from '../src/design';
import { analyseFlow, flowToMermaidSequence } from '../src/scenario';

const cls = (name: string, methods: string[] = [], kind: 'class' | 'interface' = 'class') => ({
  id: name,
  name,
  kind,
  responsibilities: [],
  attributes: [],
  methods,
});
const rel = (from: string, type: RelationshipType, to: string) => ({ id: `${from}-${to}`, from, to, type });

const design: Pick<DesignModel, 'entities' | 'relationships'> = {
  entities: [
    cls('EntryGate', ['enter(vehicle)']),
    cls('ParkingLot', ['park(vehicle)']),
    cls('SpotAllocator', ['allocate(vehicle)'], 'interface'),
    cls('NearestFirst', ['allocate(vehicle)']),
    cls('Floor'),
    cls('Ticket'),
  ],
  relationships: [
    rel('EntryGate', 'dependency', 'ParkingLot'),
    rel('ParkingLot', 'association', 'SpotAllocator'),
    rel('NearestFirst', 'implementation', 'SpotAllocator'),
    rel('ParkingLot', 'composition', 'Floor'),
  ],
};

const flow = (steps: [string, string, string][]): Flow => ({
  id: 'f',
  requirementId: 'FR-3',
  steps: steps.map(([from, to, message], i) => ({ id: `s${i}`, from, to, message })),
});

describe('analyseFlow', () => {
  it('accepts a chain where every call follows a relationship', () => {
    const result = analyseFlow(design, flow([
      ['EntryGate', 'ParkingLot', 'park(vehicle)'],
      ['ParkingLot', 'SpotAllocator', 'allocate(vehicle)'],
      ['ParkingLot', 'Floor', 'findFree(type)'],
    ]));
    expect(result.valid).toBe(true);
  });

  it('allows calling a concrete class through the interface the caller knows (polymorphism)', () => {
    const result = analyseFlow(design, flow([['ParkingLot', 'NearestFirst', 'allocate(vehicle)']]));
    expect(result.steps[0]!.navigable).toBe(true);
  });

  it('flags a call to a class the caller has no relationship with', () => {
    const result = analyseFlow(design, flow([['EntryGate', 'SpotAllocator', 'allocate(vehicle)']]));
    expect(result.valid).toBe(false);
    expect(result.steps[0]!.problems).toEqual([{ kind: 'not-navigable' }]);
  });

  it('flags a message the callee does not declare, but only when it declares methods at all', () => {
    const wrong = analyseFlow(design, flow([['EntryGate', 'ParkingLot', 'leave()']]));
    expect(wrong.steps[0]!.problems).toEqual([{ kind: 'unknown-method', method: 'leave' }]);
    const undeclared = analyseFlow(design, flow([['ParkingLot', 'Floor', 'anything()']]));
    expect(undeclared.steps[0]!.problems).toEqual([]);
  });

  it('flags unknown classes and breaks in the call chain', () => {
    const result = analyseFlow(design, flow([
      ['EntryGate', 'ParkingLot', 'park(vehicle)'],
      ['Ticket', 'Ghost', 'x()'],
    ]));
    expect(result.steps[1]!.problems).toContainEqual({ kind: 'unknown-class', name: 'Ghost' });
    expect(result.breaks).toEqual([1]);
  });

  it('treats an empty scenario as not valid', () => {
    expect(analyseFlow(design, flow([])).valid).toBe(false);
  });
});

describe('flowToMermaidSequence', () => {
  it('renders participants in order of appearance and numbered messages', () => {
    const source = flowToMermaidSequence(flow([
      ['EntryGate', 'ParkingLot', 'park(vehicle)'],
      ['ParkingLot', 'Floor', 'findFree: type'],
    ]));
    expect(source.split('\n')).toEqual([
      'sequenceDiagram',
      '  autonumber',
      '  participant EntryGate',
      '  participant ParkingLot',
      '  participant Floor',
      '  EntryGate->>ParkingLot: park(vehicle)',
      '  ParkingLot->>Floor: findFree  type',
    ]);
  });
});
