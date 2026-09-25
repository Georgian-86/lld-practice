import { describe, expect, it } from 'vitest';
import { emptyDesign } from '@blueprint/shared';
import { SubmissionParserRegistry } from '../../src/formats/parsers';
import { ValidationError } from '../../src/domain/errors';
import { design, entity } from '../fixtures/designs';

const registry = SubmissionParserRegistry.withDefaults();

describe('StructuredDesignParser', () => {
  it('normalises whitespace and drops blank list items', () => {
    const result = registry.parse({
      format: 'structured',
      design: design({
        entities: [
          entity('  ParkingLot ', 'class', { responsibilities: ['  owns floors ', '', '   '] }),
          entity('Floor'),
        ],
        tradeOffs: ['  ', 'real trade-off'],
        requirementMap: { 'FR-1': ['  Floor  ', ''], 'FR-2': [] },
      }),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.design.entities[0]!.name).toBe('ParkingLot');
    expect(result.design.entities[0]!.responsibilities).toEqual(['owns floors']);
    expect(result.design.tradeOffs).toEqual(['real trade-off']);
    expect(result.design.requirementMap).toEqual({ 'FR-1': ['Floor'] });
  });

  it('rejects an empty design with an actionable message', () => {
    const result = registry.parse({ format: 'structured', design: emptyDesign() });
    expect(result).toEqual({
      ok: false,
      errors: [{ path: 'entities', message: 'Add at least two named classes or interfaces before submitting.' }],
    });
  });

  it('rejects unnamed rows and duplicate names (case-insensitive)', () => {
    const result = registry.parse({
      format: 'structured',
      design: design({ entities: [entity('Ticket'), entity('ticket'), entity('  ')] }),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const messages = result.errors.map((e) => e.message);
    expect(messages).toContain('Every class needs a name. Remove or name the empty rows.');
    expect(messages).toContain('"ticket" is defined more than once.');
  });
});

describe('MermaidDesignParser', () => {
  it('takes classes from the diagram and written sections from the form', () => {
    const result = registry.parse({
      format: 'mermaid',
      mermaid: 'classDiagram\n  class Lot\n  Lot *-- Floor\n  class Pricing {\n <<interface>>\n +fee(t) Money\n }',
      design: design({ tradeOffs: ['kept from the form'], entities: [entity('Lot', 'class', { responsibilities: ['runs the lot'] })] }),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.design.entities.map((e) => e.name)).toEqual(['Lot', 'Floor', 'Pricing']);
    expect(result.design.entities[0]!.responsibilities).toEqual(['runs the lot']);
    expect(result.design.entities[2]!.kind).toBe('interface');
    expect(result.design.tradeOffs).toEqual(['kept from the form']);
  });

  it('reports diagram syntax errors with line numbers', () => {
    const result = registry.parse({ format: 'mermaid', mermaid: 'graph TD\n A --> B', design: emptyDesign() });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]!.message).toMatch(/^Line 1: /);
  });
});

describe('SubmissionParserRegistry', () => {
  it('rejects formats nobody registered', () => {
    const empty = new SubmissionParserRegistry();
    expect(() => empty.parse({ format: 'structured', design: emptyDesign() })).toThrow(ValidationError);
  });
});
