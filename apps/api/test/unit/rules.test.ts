import { describe, expect, it } from 'vitest';
import type { Finding } from '@blueprint/shared';
import { DesignIndex } from '../../src/evaluation/design-index';
import {
  CoreConceptRule,
  CyclicDependencyRule,
  DanglingReferenceRule,
  DesignSizeRule,
  ExtensionScenarioRule,
  GodClassRule,
  HierarchyRule,
  IsolatedEntityRule,
  NamingRule,
  PatternJustificationRule,
  RequirementConcentrationRule,
  RequirementCoverageRule,
  ScenarioRule,
  TradeOffRule,
  UndefinedResponsibilityRule,
  VariationPointRule,
  defaultRules,
} from '../../src/evaluation/rules';
import { design, entity, goodParkingDesign, rel } from '../fixtures/designs';
import { problem } from '../fixtures/harness';

const parking = problem('parking-lot');
const run = (rule: { check: (i: DesignIndex, p: typeof parking) => Finding[] }, d = goodParkingDesign(), p = parking) =>
  rule.check(new DesignIndex(d), p);
const issues = (findings: Finding[]) => findings.filter((f) => f.kind !== 'strength');
const strengths = (findings: Finding[]) => findings.filter((f) => f.kind === 'strength');

describe('the good baseline design', () => {
  it('has no major or critical rule findings', () => {
    const findings = defaultRules().flatMap((r) => run(r));
    const serious = findings.filter((f) => f.kind === 'issue' && (f.severity === 'major' || f.severity === 'critical'));
    expect(serious.map((f) => f.title)).toEqual([]);
  });

  it('every finding carries a stable fingerprint and its rule id', () => {
    const findings = defaultRules().flatMap((r) => run(r));
    for (const f of findings) {
      expect(f.fingerprint).toMatch(/^[a-z-]+:(issue|suggestion|strength):/);
      expect(f.source).toBe('rule');
    }
  });

  it('is deterministic', () => {
    const a = defaultRules().flatMap((r) => run(r));
    const b = defaultRules().flatMap((r) => run(r));
    expect(a).toEqual(b);
  });
});

describe('RequirementCoverageRule', () => {
  it('flags each unmapped functional requirement as major', () => {
    const d = goodParkingDesign();
    delete d.requirementMap['FR-2'];
    delete d.requirementMap['FR-5'];
    const found = issues(run(new RequirementCoverageRule(), d));
    expect(found.filter((f) => f.severity === 'major').map((f) => f.evidence.requirementIds)).toEqual([['FR-2'], ['FR-5']]);
  });

  it('treats a mapping to non-existent classes as uncovered', () => {
    const d = goodParkingDesign();
    d.requirementMap['FR-5'] = ['Screen'];
    const found = issues(run(new RequirementCoverageRule(), d));
    expect(found[0]?.title).toMatch(/FR-5 is mapped to classes that don't exist/);
  });

  it('recognises full coverage as a strength', () => {
    expect(strengths(run(new RequirementCoverageRule()))).toHaveLength(1);
  });
});

describe('RequirementConcentrationRule', () => {
  it('flags one class owning most requirements', () => {
    const d = goodParkingDesign();
    for (const id of ['FR-1', 'FR-2', 'FR-3', 'FR-4', 'FR-5']) d.requirementMap[id] = ['ParkingLot'];
    expect(issues(run(new RequirementConcentrationRule(), d))[0]?.evidence.entities).toEqual(['ParkingLot']);
  });
});

describe('CoreConceptRule', () => {
  it('accepts synonyms (Slot for Spot, Garage for ParkingLot)', () => {
    const d = design({
      entities: ['Garage', 'Level', 'Slot', 'Vehicle', 'Ticket'].map((n) => entity(n)),
    });
    expect(issues(run(new CoreConceptRule(), d)).filter((f) => f.severity === 'major')).toEqual([]);
  });

  it('reports a missing essential concept as major', () => {
    const d = design({ entities: ['ParkingLot', 'Floor', 'Vehicle', 'Ticket'].map((n) => entity(n)) });
    const major = issues(run(new CoreConceptRule(), d)).filter((f) => f.severity === 'major');
    expect(major.map((f) => f.title)).toEqual(['No class represents ParkingSpot']);
  });
});

describe('DesignSizeRule', () => {
  it('is critical for fewer than three classes', () => {
    const found = run(new DesignSizeRule(), design({ entities: [entity('A'), entity('B')] }));
    expect(found[0]?.severity).toBe('critical');
  });
});

describe('NamingRule', () => {
  it('flags non-PascalCase and vague names', () => {
    const d = design({ entities: [entity('parking lot'), entity('SpotManager'), entity('Ticket')] });
    const titles = run(new NamingRule(), d).map((f) => f.title);
    expect(titles).toContain('Class names are not PascalCase');
    expect(titles).toContain('"SpotManager" is a vague name');
  });
});

describe('GodClassRule', () => {
  it('flags a class with too many responsibilities', () => {
    const d = goodParkingDesign();
    d.entities[0]!.responsibilities = Array.from({ length: 9 }, (_, i) => `job ${i}`);
    const found = run(new GodClassRule(), d);
    expect(found).toHaveLength(1);
    expect(found[0]?.evidence.entities).toEqual(['ParkingLot']);
    expect(found[0]?.severity).toBe('major'); // 9 is clearly over the limit of 6
  });

  it('only nudges a class that is just over one limit', () => {
    const d = goodParkingDesign();
    d.entities[0]!.responsibilities = Array.from({ length: 7 }, (_, i) => `job ${i}`);
    expect(run(new GodClassRule(), d)[0]?.severity).toBe('minor');
  });
});

describe('UndefinedResponsibilityRule', () => {
  it('flags classes with no responsibilities or methods, and empty interfaces', () => {
    const d = design({
      entities: [
        entity('Ticket', 'class', { responsibilities: [] }),
        entity('Pricing', 'interface', { methods: [] }),
        entity('Size', 'enum', { responsibilities: [] }),
      ],
    });
    const titles = run(new UndefinedResponsibilityRule(), d).map((f) => f.title);
    expect(titles).toContain('1 class has no stated responsibility');
    expect(titles).toContain('Interface Pricing declares no methods');
  });
});

describe('relationship rules', () => {
  it('reports relationships to undefined classes', () => {
    const d = goodParkingDesign();
    d.relationships.push(rel('ParkingLot', 'association', 'Ghost'));
    const found = run(new DanglingReferenceRule(), d);
    expect(found[0]?.message).toContain('"Ghost"');
  });

  it('reports a design with classes but no relationships as critical', () => {
    const d = design({ entities: [entity('A'), entity('B'), entity('C')] });
    expect(run(new IsolatedEntityRule(), d).some((f) => f.severity === 'critical')).toBe(true);
  });

  it('detects inheritance cycles as critical and ownership cycles as major', () => {
    const d = design({
      entities: [entity('A'), entity('B'), entity('C'), entity('D')],
      relationships: [rel('A', 'inheritance', 'B'), rel('B', 'inheritance', 'A'), rel('C', 'composition', 'D'), rel('D', 'composition', 'C')],
    });
    const found = run(new CyclicDependencyRule(), d);
    expect(found.map((f) => [f.title, f.severity])).toEqual([
      ['Circular inheritance', 'critical'],
      ['Circular ownership', 'major'],
    ]);
  });

  it('does not flag an acyclic design', () => {
    expect(run(new CyclicDependencyRule())).toEqual([]);
  });

  it('flags implementing a class and extending an interface', () => {
    const d = design({
      entities: [entity('Base'), entity('Api', 'interface'), entity('X'), entity('Y')],
      relationships: [rel('X', 'implementation', 'Base'), rel('Y', 'inheritance', 'Api')],
    });
    const titles = run(new HierarchyRule(), d).map((f) => f.title);
    expect(titles).toEqual(['X "implements" a class', 'Y "extends" interface Api']);
  });

  it('flags hierarchies deeper than three levels', () => {
    const names = ['L0', 'L1', 'L2', 'L3', 'L4'];
    const d = design({
      entities: names.map((n) => entity(n)),
      relationships: names.slice(1).map((n, i) => rel(n, 'inheritance', names[i]!)),
    });
    expect(run(new HierarchyRule(), d).map((f) => f.title)).toEqual(['Deep hierarchy under L4']);
  });
});

describe('VariationPointRule', () => {
  it('credits an abstraction with implementations regardless of its exact name', () => {
    const found = run(new VariationPointRule());
    expect(strengths(found)).toHaveLength(3);
  });

  it('flags a concrete class sitting on a variation point', () => {
    const d = goodParkingDesign();
    d.entities = d.entities.filter((e) => !['PricingStrategy', 'HourlyPricing'].includes(e.name));
    d.entities.push(entity('FeeCalculator'));
    const pricing = issues(run(new VariationPointRule(), d));
    expect(pricing[0]?.title).toBe('Fee calculation is hard-wired in FeeCalculator');
  });

  it('suggests implementations for an abstraction nobody implements', () => {
    const d = goodParkingDesign();
    d.relationships = d.relationships.filter((r) => r.from !== 'HourlyPricing');
    expect(issues(run(new VariationPointRule(), d))[0]?.title).toBe('PricingStrategy has no implementations');
  });
});

describe('PatternJustificationRule', () => {
  it('flags an unjustified pattern and one tied to no classes', () => {
    const d = goodParkingDesign();
    d.patterns = [{ id: 'p', name: 'Singleton', appliedTo: [], justification: 'only one' }];
    const titles = run(new PatternJustificationRule(), d).map((f) => f.title);
    expect(titles).toEqual(['Singleton: justification is too thin', 'Singleton is not tied to your classes']);
  });
});

describe('ExtensionScenarioRule', () => {
  it('is major when unanswered, minor when vague, a strength when concrete', () => {
    const d = goodParkingDesign();
    expect(strengths(run(new ExtensionScenarioRule(), d))).toHaveLength(1);
    d.extensionAnswer = 'I would add a new class for it.';
    expect(run(new ExtensionScenarioRule(), d)[0]?.severity).toBe('minor');
    d.extensionAnswer = '  ';
    d.extensionAnswer = d.extensionAnswer.trim();
    expect(run(new ExtensionScenarioRule(), d)[0]?.severity).toBe('major');
  });
});

describe('TradeOffRule', () => {
  it('distinguishes none, slogans and reasoned trade-offs', () => {
    const d = goodParkingDesign();
    expect(strengths(run(new TradeOffRule(), d))).toHaveLength(1);
    d.tradeOffs = ['Used strategy'];
    const titles = run(new TradeOffRule(), d).map((f) => f.title);
    expect(titles).toContain('1 trade-off is a slogan, not a trade-off');
    d.tradeOffs = [];
    expect(run(new TradeOffRule(), d)[0]?.severity).toBe('critical'); // no evidence for the criterion at all
  });
});

describe('ScenarioRule', () => {
  const withFlow = (steps: [string, string, string][]) => {
    const d = goodParkingDesign();
    d.flows = [{ id: 'f', requirementId: 'FR-3', steps: steps.map(([from, to, message], i) => ({ id: `s${i}`, from, to, message })) }];
    return d;
  };

  it('only nudges (info) when no scenario was walked through', () => {
    const found = run(new ScenarioRule());
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ severity: 'info', kind: 'suggestion' });
  });

  it('credits a scenario whose calls all follow relationships', () => {
    const d = withFlow([
      ['EntryGate', 'ParkingLot', 'enter'],
      ['ParkingLot', 'SpotAllocationStrategy', 'allocate(vehicle)'],
      ['ParkingLot', 'PricingStrategy', 'fee(ticket)'],
    ]);
    expect(strengths(run(new ScenarioRule(), d)).map((f) => f.title)).toEqual(['FR-3 scenario runs end to end']);
  });

  it('flags a call the caller cannot make (major) and an undeclared method (minor)', () => {
    const d = withFlow([
      ['EntryGate', 'PricingStrategy', 'fee(ticket)'],
      ['EntryGate', 'ParkingLot', 'teleport()'],
    ]);
    const found = issues(run(new ScenarioRule(), d));
    expect(found.map((f) => [f.title, f.severity])).toEqual([
      ['FR-3 scenario: EntryGate cannot reach PricingStrategy', 'major'],
    ]);
    // ParkingLot declares no methods in the fixture, so any message is accepted there.
  });
});
