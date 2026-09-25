import { describe, expect, it } from 'vitest';
import { designToMermaid, parseMermaidClassDiagram } from '../src/mermaid';

describe('parseMermaidClassDiagram', () => {
  it('parses classes, annotations and members', () => {
    const result = parseMermaidClassDiagram(`classDiagram
      class PricingStrategy {
        <<interface>>
        +fee(ticket) Money
      }
      class Ticket {
        +DateTime entryTime
        +close()
      }
      <<enumeration>> SpotSize
    `);
    expect(result.errors).toEqual([]);
    const [pricing, ticket, size] = result.entities;
    expect(pricing).toMatchObject({ name: 'PricingStrategy', kind: 'interface', methods: ['+fee(ticket) Money'] });
    expect(ticket).toMatchObject({ attributes: ['+DateTime entryTime'], methods: ['+close()'] });
    expect(size).toMatchObject({ name: 'SpotSize', kind: 'enum' });
  });

  it.each([
    ['Vehicle <|-- Car', 'inheritance', 'Car', 'Vehicle'],
    ['Car --|> Vehicle', 'inheritance', 'Car', 'Vehicle'],
    ['Hourly ..|> Pricing', 'implementation', 'Hourly', 'Pricing'],
    ['Pricing <|.. Hourly', 'implementation', 'Hourly', 'Pricing'],
    ['Lot *-- Floor', 'composition', 'Lot', 'Floor'],
    ['Floor --* Lot', 'composition', 'Lot', 'Floor'],
    ['Lot o-- Gate', 'aggregation', 'Lot', 'Gate'],
    ['Ticket --> Spot', 'association', 'Ticket', 'Spot'],
    ['Gate ..> Printer', 'dependency', 'Gate', 'Printer'],
  ])('normalises "%s" to %s from %s to %s', (line, type, from, to) => {
    const { relationships, errors } = parseMermaidClassDiagram(`classDiagram\n${line}`);
    expect(errors).toEqual([]);
    expect(relationships[0]).toMatchObject({ type, from, to });
  });

  it('keeps cardinality and labels', () => {
    const { relationships } = parseMermaidClassDiagram('classDiagram\nLot "1" *-- "many" Floor : has');
    expect(relationships[0]).toMatchObject({ label: 'has', multiplicity: '1 → many' });
  });

  it('reports a missing header and an unclosed block as errors', () => {
    expect(parseMermaidClassDiagram('class A').errors[0]?.message).toMatch(/must start with "classDiagram"/);
    expect(parseMermaidClassDiagram('classDiagram\nclass A {\n +x').errors[0]?.message).toMatch(/missing a closing/);
  });

  it('warns about lines it cannot understand but keeps going', () => {
    const result = parseMermaidClassDiagram('classDiagram\nclass A\nthis is not mermaid\nclass B');
    expect(result.errors).toEqual([]);
    expect(result.warnings[0]?.line).toBe(3);
    expect(result.entities.map((e) => e.name)).toEqual(['A', 'B']);
  });

  it('reports an empty diagram', () => {
    expect(parseMermaidClassDiagram('').errors).toHaveLength(1);
    expect(parseMermaidClassDiagram('classDiagram').errors[0]?.message).toBe('No classes found in the diagram.');
  });
});

describe('designToMermaid', () => {
  it('round-trips through the parser', () => {
    const source = designToMermaid({
      entities: [
        { id: '1', name: 'Parking Lot', kind: 'class', responsibilities: [], attributes: ['floors: List<Floor>'], methods: ['park(v): Ticket'] },
        { id: '2', name: 'Pricing', kind: 'interface', responsibilities: [], attributes: [], methods: ['fee()'] },
        { id: '3', name: 'Hourly', kind: 'class', responsibilities: [], attributes: [], methods: [] },
      ],
      relationships: [
        { id: 'a', from: 'Hourly', to: 'Pricing', type: 'implementation' },
        { id: 'b', from: 'Parking Lot', to: 'Pricing', type: 'association', label: 'uses: "fees"' },
        { id: 'c', from: 'Parking Lot', to: 'Ghost', type: 'association' },
      ],
    });
    const parsed = parseMermaidClassDiagram(source);
    expect(parsed.errors).toEqual([]);
    expect(parsed.warnings).toEqual([]);
    expect(parsed.entities.map((e) => [e.name, e.kind])).toEqual([
      ['Parking_Lot', 'class'],
      ['Pricing', 'interface'],
      ['Hourly', 'class'],
    ]);
    // Dangling relationships are not drawn.
    expect(parsed.relationships.map((r) => r.type)).toEqual(['implementation', 'association']);
  });
});
