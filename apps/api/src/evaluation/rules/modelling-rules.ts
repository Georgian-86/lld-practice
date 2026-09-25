import type { Finding, Problem } from '@blueprint/shared';
import type { DesignIndex } from '../design-index';
import type { DesignRule } from '../evaluator';
import { listToSentence, nameMatches } from '../text';
import { ruleFinding } from './finding';

/** The problem's core concepts should appear as entities (synonyms accepted). */
export class CoreConceptRule implements DesignRule {
  readonly id = 'core-concepts';
  readonly criterionId = 'modelling' as const;

  check(index: DesignIndex, problem: Problem): Finding[] {
    const findings: Finding[] = [];
    const missingEssential: string[] = [];
    const matched: string[] = [];

    for (const concept of problem.coreConcepts) {
      const candidates = [concept.name, ...concept.synonyms];
      const hit = index.entities.find((e) => nameMatches(e.name, candidates));
      if (hit) {
        matched.push(concept.name);
        continue;
      }
      if (concept.essential) {
        missingEssential.push(concept.name);
        findings.push(
          ruleFinding({
            ruleId: this.id,
            criterionId: this.criterionId,
            kind: 'issue',
            severity: 'major',
            key: concept.name,
            title: `No class represents ${concept.name}`,
            message: `${concept.name} is central to this problem, but no class in your design models it (accepted names include ${listToSentence(candidates.slice(0, 4))}).`,
            suggestion: `Add a ${concept.name} class, or rename an existing class if it already plays this role.`,
          }),
        );
      } else {
        findings.push(
          ruleFinding({
            ruleId: this.id,
            criterionId: this.criterionId,
            kind: 'suggestion',
            severity: 'info',
            key: concept.name,
            title: `Consider modelling ${concept.name}`,
            message: `Many strong designs include a ${concept.name} concept. It is optional, but think about which class currently carries that responsibility.`,
          }),
        );
      }
    }

    if (missingEssential.length === 0) {
      findings.push(
        ruleFinding({
          ruleId: this.id,
          criterionId: this.criterionId,
          kind: 'strength',
          severity: 'info',
          key: 'all',
          title: 'All core concepts are modelled',
          message: `Your design names every essential concept of the problem (${matched.length} of ${problem.coreConcepts.length} concepts overall).`,
        }),
      );
    }
    return findings;
  }
}

export class DesignSizeRule implements DesignRule {
  readonly id = 'design-size';
  readonly criterionId = 'modelling' as const;

  check(index: DesignIndex): Finding[] {
    const count = index.entities.length;
    if (count >= 4) return [];
    return [
      ruleFinding({
        ruleId: this.id,
        criterionId: this.criterionId,
        kind: 'issue',
        severity: count < 3 ? 'critical' : 'major',
        title: `Only ${count} classes`,
        message: `With ${count} classes, responsibilities are almost certainly bundled together. Most interview-grade designs for this problem have 6–12 classes and interfaces.`,
        suggestion: 'Walk through the main use case step by step and give each distinct job its own class.',
      }),
    ];
  }
}

const VAGUE_SUFFIXES = ['Manager', 'Helper', 'Util', 'Utils', 'Misc', 'Data', 'Info'];

export class NamingRule implements DesignRule {
  readonly id = 'naming';
  readonly criterionId = 'modelling' as const;

  check(index: DesignIndex): Finding[] {
    const findings: Finding[] = [];
    const badCase = index.entities.filter((e) => !/^[A-Z][A-Za-z0-9]*$/.test(e.name));
    if (badCase.length) {
      findings.push(
        ruleFinding({
          ruleId: this.id,
          criterionId: this.criterionId,
          kind: 'issue',
          severity: 'minor',
          key: 'case',
          title: 'Class names are not PascalCase',
          message: `${listToSentence(badCase.map((e) => e.name))} ${badCase.length === 1 ? 'does' : 'do'} not follow the PascalCase convention (no spaces, starts with a capital).`,
          suggestion: 'Use PascalCase nouns such as ParkingSpot or ElevatorController.',
          evidence: { entities: badCase.map((e) => e.name) },
        }),
      );
    }
    const vague = index.entities.filter((e) => VAGUE_SUFFIXES.some((s) => e.name.endsWith(s) && e.name !== s));
    for (const entity of vague) {
      findings.push(
        ruleFinding({
          ruleId: this.id,
          criterionId: this.criterionId,
          kind: 'suggestion',
          severity: 'info',
          key: entity.name,
          title: `"${entity.name}" is a vague name`,
          message: `Names ending in Manager/Helper/Util say little about what a class does and tend to attract unrelated code.`,
          suggestion: `Name it after its job — e.g. an allocator, a scheduler, a registry, a calculator.`,
          evidence: { entities: [entity.name] },
        }),
      );
    }
    return findings;
  }
}
