import type { Finding } from '@blueprint/shared';
import type { DesignIndex } from '../design-index';
import type { DesignRule } from '../evaluator';
import { listToSentence } from '../text';
import { ruleFinding } from './finding';

/** Relationships must point at classes that exist. */
export class DanglingReferenceRule implements DesignRule {
  readonly id = 'dangling-reference';
  readonly criterionId = 'relationships' as const;

  check(index: DesignIndex): Finding[] {
    const dangling = index.danglingRelationships();
    if (dangling.length === 0) return [];
    const missing = [
      ...new Set(dangling.flatMap((r) => [r.from, r.to]).filter((name) => !index.has(name))),
    ];
    return [
      ruleFinding({
        ruleId: this.id,
        criterionId: this.criterionId,
        kind: 'issue',
        severity: 'major',
        key: missing.join(',').toLowerCase(),
        title: `${dangling.length} ${dangling.length === 1 ? 'relationship points' : 'relationships point'} to undefined classes`,
        message: `Relationships reference ${listToSentence(missing)}, which ${missing.length === 1 ? 'is' : 'are'} not defined as ${missing.length === 1 ? 'a class' : 'classes'}.`,
        suggestion: 'Define the missing classes or correct the names — a reviewer cannot follow a relationship to nowhere.',
        evidence: { relationships: dangling.map((r) => r.id) },
      }),
    ];
  }
}

/** Classes with no relationships at all are islands. */
export class IsolatedEntityRule implements DesignRule {
  readonly id = 'isolated-entity';
  readonly criterionId = 'relationships' as const;

  check(index: DesignIndex): Finding[] {
    if (index.entities.length < 3) return [];
    const isolated = index.entities.filter((e) => index.degree(e.name) === 0);
    const classes = isolated.filter((e) => e.kind !== 'enum');
    const findings: Finding[] = [];
    if (classes.length) {
      findings.push(
        ruleFinding({
          ruleId: this.id,
          criterionId: this.criterionId,
          kind: 'issue',
          severity: classes.length >= Math.max(3, index.entities.length / 2) ? 'major' : 'minor',
          key: 'classes',
          title: `${classes.length} ${classes.length === 1 ? 'class is' : 'classes are'} not connected`,
          message: `${listToSentence(classes.map((e) => e.name))} ${classes.length === 1 ? 'has' : 'have'} no relationships, so it is unclear who creates, owns or uses ${classes.length === 1 ? 'it' : 'them'}.`,
          suggestion: 'Add the relationships that show how these classes collaborate in the main use case.',
          evidence: { entities: classes.map((e) => e.name) },
        }),
      );
    }
    if (index.relationships.length === 0 && index.entities.length >= 3) {
      findings.push(
        ruleFinding({
          ruleId: this.id,
          criterionId: this.criterionId,
          kind: 'issue',
          severity: 'critical',
          key: 'none',
          title: 'No relationships defined',
          message: 'The design lists classes but not how they relate. Relationships are half of a class diagram.',
          suggestion: 'Add composition, association, inheritance and dependency links between your classes.',
        }),
      );
    }
    return findings;
  }
}

/** Cycles in ownership or inheritance are errors; cycles in usage are coupling smells. */
export class CyclicDependencyRule implements DesignRule {
  readonly id = 'cyclic-dependency';
  readonly criterionId = 'relationships' as const;

  check(index: DesignIndex): Finding[] {
    const findings: Finding[] = [];
    for (const cycle of index.cycles(['inheritance', 'implementation'])) {
      findings.push(
        ruleFinding({
          ruleId: this.id,
          criterionId: this.criterionId,
          kind: 'issue',
          severity: 'critical',
          key: `inherit:${[...cycle].sort().join(',')}`,
          title: 'Circular inheritance',
          message: `${cycle.join(' → ')} → ${cycle[0]} forms an inheritance cycle, which cannot exist in code.`,
          suggestion: 'Decide which type is the more general one and make the arrow point only that way.',
          evidence: { entities: cycle },
        }),
      );
    }
    for (const cycle of index.cycles(['composition', 'aggregation'])) {
      findings.push(
        ruleFinding({
          ruleId: this.id,
          criterionId: this.criterionId,
          kind: 'issue',
          severity: 'major',
          key: `own:${[...cycle].sort().join(',')}`,
          title: 'Circular ownership',
          message: `${cycle.join(' owns ')} owns ${cycle[0]}. Ownership must form a tree; a cycle means no class clearly controls the others' lifecycle.`,
          suggestion: 'Keep composition from whole to part only; use a plain association for the back-reference.',
          evidence: { entities: cycle },
        }),
      );
    }
    const usageCycles = index
      .cycles(['association', 'dependency', 'composition', 'aggregation'])
      .filter((c) => c.length >= 3);
    for (const cycle of usageCycles.slice(0, 2)) {
      findings.push(
        ruleFinding({
          ruleId: this.id,
          criterionId: this.criterionId,
          kind: 'suggestion',
          severity: 'minor',
          key: `use:${[...cycle].sort().join(',')}`,
          title: 'Dependency cycle',
          message: `${cycle.join(' → ')} → ${cycle[0]} depend on each other in a loop, so none of them can be changed or tested in isolation.`,
          suggestion: 'Break the loop by introducing an interface or an event/callback at one edge.',
          evidence: { entities: cycle },
        }),
      );
    }
    return findings;
  }
}

/** Inheritance used correctly: interfaces are implemented, classes extended, hierarchies shallow. */
export class HierarchyRule implements DesignRule {
  readonly id = 'hierarchy';
  readonly criterionId = 'relationships' as const;

  check(index: DesignIndex): Finding[] {
    const findings: Finding[] = [];
    for (const rel of index.resolvedRelationships()) {
      const from = index.find(rel.from)!;
      const to = index.find(rel.to)!;
      if (rel.type === 'implementation' && to.kind !== 'interface') {
        findings.push(
          ruleFinding({
            ruleId: this.id,
            criterionId: this.criterionId,
            kind: 'issue',
            severity: 'minor',
            key: `impl:${rel.from}->${rel.to}`,
            title: `${from.name} "implements" ${to.kind === 'enum' ? 'an enum' : 'a class'}`,
            message: `Implementation is for interfaces, but ${to.name} is ${to.kind === 'abstract' ? 'an abstract class' : `a ${to.kind}`}.`,
            suggestion: to.kind === 'abstract' ? `Use inheritance (extends) from ${to.name}.` : `Make ${to.name} an interface, or use inheritance.`,
            evidence: { entities: [from.name, to.name], relationships: [rel.id] },
          }),
        );
      }
      if (rel.type === 'inheritance' && to.kind === 'interface' && from.kind !== 'interface') {
        findings.push(
          ruleFinding({
            ruleId: this.id,
            criterionId: this.criterionId,
            kind: 'issue',
            severity: 'minor',
            key: `ext:${rel.from}->${rel.to}`,
            title: `${from.name} "extends" interface ${to.name}`,
            message: `A class implements an interface rather than extending it.`,
            suggestion: `Change the relationship to implementation.`,
            evidence: { entities: [from.name, to.name], relationships: [rel.id] },
          }),
        );
      }
    }
    for (const entity of index.entities) {
      const depth = index.inheritanceDepth(entity.name);
      if (depth > 3) {
        findings.push(
          ruleFinding({
            ruleId: this.id,
            criterionId: this.criterionId,
            kind: 'issue',
            severity: 'minor',
            key: `depth:${entity.name}`,
            title: `Deep hierarchy under ${entity.name}`,
            message: `${entity.name} sits ${depth} levels deep in a class hierarchy. Deep hierarchies are brittle: a change high up ripples everywhere.`,
            suggestion: 'Prefer composition — move the varying behaviour into a strategy object instead of another subclass.',
            evidence: { entities: [entity.name] },
          }),
        );
      }
    }
    return findings;
  }
}
