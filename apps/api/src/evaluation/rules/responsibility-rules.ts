import type { Finding } from '@blueprint/shared';
import type { DesignIndex } from '../design-index';
import type { DesignRule } from '../evaluator';
import { listToSentence } from '../text';
import { ruleFinding } from './finding';

export const GOD_CLASS_LIMITS = { responsibilities: 6, methods: 12, degree: 7 } as const;

/** A class with too many jobs or too many collaborators. */
export class GodClassRule implements DesignRule {
  readonly id = 'god-class';
  readonly criterionId = 'responsibilities' as const;

  check(index: DesignIndex): Finding[] {
    const findings: Finding[] = [];
    for (const entity of index.entities) {
      const reasons: string[] = [];
      if (entity.responsibilities.length > GOD_CLASS_LIMITS.responsibilities) {
        reasons.push(`${entity.responsibilities.length} responsibilities`);
      }
      if (entity.methods.length > GOD_CLASS_LIMITS.methods) reasons.push(`${entity.methods.length} methods`);
      const degree = index.degree(entity.name);
      if (degree > GOD_CLASS_LIMITS.degree) reasons.push(`relationships with ${degree} classes`);
      if (reasons.length === 0) continue;
      findings.push(
        ruleFinding({
          ruleId: this.id,
          criterionId: this.criterionId,
          kind: 'issue',
          severity: reasons.length > 1 ? 'major' : 'minor',
          key: entity.name,
          title: `${entity.name} may be doing too much`,
          message: `${entity.name} has ${reasons.join(' and ')}. Classes like this change for many unrelated reasons, which makes them fragile.`,
          suggestion: `Group ${entity.name}'s responsibilities by the reason they would change, and move each group into its own collaborator.`,
          evidence: { entities: [entity.name] },
        }),
      );
    }
    return findings;
  }
}

/** Classes with no stated job, and interfaces with no contract. */
export class UndefinedResponsibilityRule implements DesignRule {
  readonly id = 'undefined-responsibility';
  readonly criterionId = 'responsibilities' as const;

  check(index: DesignIndex): Finding[] {
    const findings: Finding[] = [];
    const empty = index.entities.filter(
      (e) => e.kind !== 'enum' && e.responsibilities.length === 0 && e.methods.length === 0,
    );
    if (empty.length) {
      findings.push(
        ruleFinding({
          ruleId: this.id,
          criterionId: this.criterionId,
          kind: 'issue',
          severity: empty.length >= Math.max(3, index.entities.length / 2) ? 'major' : 'minor',
          key: 'empty',
          title: `${empty.length} ${empty.length === 1 ? 'class has' : 'classes have'} no stated responsibility`,
          message: `${listToSentence(empty.map((e) => e.name))} ${empty.length === 1 ? 'has' : 'have'} neither responsibilities nor methods, so a reviewer cannot tell what ${empty.length === 1 ? 'it does' : 'they do'}.`,
          suggestion: 'For each class write one sentence: "This class is responsible for …". If you cannot, the class may not be needed.',
          evidence: { entities: empty.map((e) => e.name) },
        }),
      );
    }
    const hollowInterfaces = index.entities.filter((e) => e.kind === 'interface' && e.methods.length === 0);
    for (const entity of hollowInterfaces) {
      findings.push(
        ruleFinding({
          ruleId: this.id,
          criterionId: this.criterionId,
          kind: 'issue',
          severity: 'minor',
          key: `interface-${entity.name}`,
          title: `Interface ${entity.name} declares no methods`,
          message: `An interface is a contract; without method signatures, implementors have nothing to honour.`,
          suggestion: `Add the method signatures callers of ${entity.name} rely on, with parameters and return types.`,
          evidence: { entities: [entity.name] },
        }),
      );
    }
    const described = index.entities.filter((e) => e.responsibilities.length > 0).length;
    if (index.entities.length >= 4 && described === index.entities.length) {
      findings.push(
        ruleFinding({
          ruleId: this.id,
          criterionId: this.criterionId,
          kind: 'strength',
          severity: 'info',
          key: 'all-described',
          title: 'Every class has a stated responsibility',
          message: 'Each class explains its job, which makes the design easy to review and discuss.',
        }),
      );
    }
    return findings;
  }
}
