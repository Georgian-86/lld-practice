import type { Finding, Problem } from '@blueprint/shared';
import { nameKey } from '@blueprint/shared';
import type { DesignIndex } from '../design-index';
import type { DesignRule } from '../evaluator';
import { listToSentence } from '../text';
import { ruleFinding } from './finding';

/** Every functional requirement must be owned by at least one existing class. */
export class RequirementCoverageRule implements DesignRule {
  readonly id = 'requirement-coverage';
  readonly criterionId = 'requirements' as const;

  check(index: DesignIndex, problem: Problem): Finding[] {
    const findings: Finding[] = [];
    const map = index.design.requirementMap;
    let covered = 0;

    for (const requirement of problem.functionalRequirements) {
      const mapped = map[requirement.id] ?? [];
      const known = mapped.filter((name) => index.has(name));
      const unknown = mapped.filter((name) => !index.has(name));
      if (known.length > 0) covered++;
      if (mapped.length === 0) {
        findings.push(
          ruleFinding({
            ruleId: this.id,
            criterionId: this.criterionId,
            kind: 'issue',
            severity: 'major',
            key: requirement.id,
            title: `${requirement.id} has no owner`,
            message: `No class is mapped to "${requirement.text}" If nobody owns a requirement, it usually ends up scattered across classes or forgotten.`,
            suggestion: `Decide which class is responsible for ${requirement.id} and drag the ${requirement.id} chip onto it on the diagram. If none fits, that is a sign a class is missing.`,
            evidence: { requirementIds: [requirement.id] },
          }),
        );
      } else if (known.length === 0) {
        findings.push(
          ruleFinding({
            ruleId: this.id,
            criterionId: this.criterionId,
            kind: 'issue',
            severity: 'major',
            key: `${requirement.id}-unknown`,
            title: `${requirement.id} is mapped to classes that don't exist`,
            message: `${requirement.id} points at ${listToSentence(unknown)}, which ${unknown.length === 1 ? 'is' : 'are'} not defined in your design.`,
            suggestion: 'Add the missing class, or re-assign the requirement to a class that exists.',
            evidence: { requirementIds: [requirement.id] },
          }),
        );
      } else if (unknown.length > 0) {
        findings.push(
          ruleFinding({
            ruleId: this.id,
            criterionId: this.criterionId,
            kind: 'issue',
            severity: 'minor',
            key: `${requirement.id}-partial`,
            title: `${requirement.id} references an undefined class`,
            message: `${requirement.id} also points at ${listToSentence(unknown)}, which is not defined.`,
            suggestion: 'Remove the stale mapping or add the class.',
            evidence: { requirementIds: [requirement.id], entities: known },
          }),
        );
      }
    }

    for (const requirement of problem.nonFunctionalRequirements) {
      const mapped = (map[requirement.id] ?? []).filter((name) => index.has(name));
      if (mapped.length === 0) {
        findings.push(
          ruleFinding({
            ruleId: this.id,
            criterionId: this.criterionId,
            kind: 'suggestion',
            severity: 'minor',
            key: requirement.id,
            title: `Show where ${requirement.id} is handled`,
            message: `"${requirement.text}" is not mapped to any class. Non-functional requirements often decide the shape of a design, so interviewers look for them explicitly.`,
            suggestion: `Drag ${requirement.id} onto the class (or abstraction) that guarantees it.`,
            evidence: { requirementIds: [requirement.id] },
          }),
        );
      }
    }

    const total = problem.functionalRequirements.length;
    if (covered === total) {
      findings.push(
        ruleFinding({
          ruleId: this.id,
          criterionId: this.criterionId,
          kind: 'strength',
          severity: 'info',
          key: 'all',
          title: 'Every functional requirement has an owner',
          message: `All ${total} functional requirements are traced to classes in your design.`,
        }),
      );
    }
    return findings;
  }
}

/** One class owning most requirements is usually a god class in disguise. */
export class RequirementConcentrationRule implements DesignRule {
  readonly id = 'requirement-concentration';
  readonly criterionId = 'responsibilities' as const;

  check(index: DesignIndex, problem: Problem): Finding[] {
    const total = problem.functionalRequirements.length;
    if (total < 4) return [];
    const counts = new Map<string, number>();
    for (const requirement of problem.functionalRequirements) {
      const owners = new Set((index.design.requirementMap[requirement.id] ?? []).filter((n) => index.has(n)).map(nameKey));
      for (const owner of owners) counts.set(owner, (counts.get(owner) ?? 0) + 1);
    }
    const findings: Finding[] = [];
    for (const [key, count] of counts) {
      if (count / total >= 0.67) {
        const entity = index.find(key)!;
        findings.push(
          ruleFinding({
            ruleId: this.id,
            criterionId: this.criterionId,
            kind: 'issue',
            severity: 'minor',
            key,
            title: `${entity.name} owns ${count} of ${total} requirements`,
            message: `${entity.name} is mapped to most requirements. That is fine for a thin facade that delegates, but if it also implements the logic it will grow into a god class.`,
            suggestion: `Keep ${entity.name} as the entry point, but map each requirement to the class that actually does the work.`,
            evidence: { entities: [entity.name] },
          }),
        );
      }
    }
    return findings;
  }
}
