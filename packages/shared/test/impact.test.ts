import { describe, expect, it } from 'vitest';
import type { DesignModel, RelationshipType } from '../src/design';
import { diffDesigns } from '../src/impact';

type D = Pick<DesignModel, 'entities' | 'relationships'>;
const cls = (id: string, name: string, methods: string[] = [], kind: 'class' | 'interface' = 'class') => ({
  id,
  name,
  kind,
  responsibilities: [],
  attributes: [],
  methods,
});
const rel = (from: string, type: RelationshipType, to: string) => ({ id: `${from}-${type}-${to}`, from, to, type });

const v1: D = {
  entities: [cls('e1', 'ParkingLot', ['park(vehicle)']), cls('e2', 'PricingStrategy', ['fee(ticket)'], 'interface'), cls('e3', 'HourlyPricing')],
  relationships: [rel('ParkingLot', 'association', 'PricingStrategy'), rel('HourlyPricing', 'implementation', 'PricingStrategy')],
};

const status = (d: ReturnType<typeof diffDesigns>) => Object.fromEntries(d.entities.map((e) => [e.name, e.status]));

describe('diffDesigns', () => {
  it('reports no change for an identical design', () => {
    const d = diffDesigns(v1, v1);
    expect(d.verdict).toBe('none');
    expect(d.counts.unchanged).toBe(3);
  });

  it('counts a new implementation of an existing interface as pure extension', () => {
    const v2: D = {
      entities: [...v1.entities, cls('e4', 'EvPricing')],
      relationships: [...v1.relationships, rel('EvPricing', 'implementation', 'PricingStrategy')],
    };
    const d = diffDesigns(v1, v2);
    expect(status(d)).toEqual({ ParkingLot: 'unchanged', PricingStrategy: 'unchanged', HourlyPricing: 'unchanged', EvPricing: 'added' });
    expect(d.verdict).toBe('extended');
  });

  it('marks a class modified when its members or outgoing relationships change', () => {
    const v2: D = {
      entities: [cls('e1', 'ParkingLot', ['park(vehicle)', 'chargeEv(vehicle)']), v1.entities[1]!, v1.entities[2]!, cls('e4', 'Charger')],
      relationships: [...v1.relationships, rel('ParkingLot', 'composition', 'Charger')],
    };
    const d = diffDesigns(v1, v2);
    const lot = d.entities.find((e) => e.name === 'ParkingLot')!;
    expect(lot.status).toBe('modified');
    expect(lot.changes).toEqual(['+ method chargeEv(vehicle)', 'now owns Charger']);
    expect(d.verdict).toBe('contained');
  });

  it('follows renames by id and reports removed classes', () => {
    const v2: D = {
      entities: [cls('e1', 'Garage', ['park(vehicle)']), v1.entities[1]!],
      relationships: [rel('Garage', 'association', 'PricingStrategy')],
    };
    const d = diffDesigns(v1, v2);
    expect(d.entities.find((e) => e.id === 'e1')!.changes).toEqual(['renamed from ParkingLot']);
    expect(d.entities.find((e) => e.name === 'HourlyPricing')!.status).toBe('removed');
  });

  it('matches by name when ids differ (e.g. re-imported Mermaid)', () => {
    const v2: D = { entities: v1.entities.map((e) => ({ ...e, id: `x-${e.id}` })), relationships: v1.relationships };
    expect(diffDesigns(v1, v2).verdict).toBe('none');
  });

  it('calls it a ripple when many existing classes change', () => {
    const v2: D = {
      entities: v1.entities.map((e) => ({ ...e, methods: [...e.methods, 'ev()'] })),
      relationships: v1.relationships,
    };
    expect(diffDesigns(v1, v2).verdict).toBe('rippled');
  });
});
