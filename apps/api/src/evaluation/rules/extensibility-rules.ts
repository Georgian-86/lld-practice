import type { Finding, Problem } from '@blueprint/shared';
import type { DesignIndex } from '../design-index';
import type { DesignRule } from '../evaluator';
import { listToSentence, mentionsAny, wordCount } from '../text';
import { ruleFinding } from './finding';

/**
 * Each declared variation point (pricing, scheduling, ...) should sit behind
 * an interface/abstract class with at least one implementation. We check the
 * *property* ("is there an abstraction here?"), not a specific class name, so
 * any valid design choice passes.
 */
export class VariationPointRule implements DesignRule {
  readonly id = 'variation-point';
  readonly criterionId = 'extensibility' as const;

  check(index: DesignIndex, problem: Problem): Finding[] {
    const findings: Finding[] = [];
    for (const point of problem.variationPoints) {
      const related = index.entities.filter((e) => mentionsAny(e.name, point.keywords).length > 0);
      const abstraction = related.find((e) => index.isAbstraction(e));
      if (abstraction) {
        const implementors = index.implementorsOf(abstraction.name);
        if (implementors.length > 0) {
          findings.push(
            ruleFinding({
              ruleId: this.id,
              criterionId: this.criterionId,
              kind: 'strength',
              severity: 'info',
              key: point.id,
              title: `${point.name} is behind an abstraction`,
              message: `${abstraction.name} isolates ${point.name.toLowerCase()} with ${implementors.length} implementation${implementors.length === 1 ? '' : 's'} (${listToSentence(implementors.map((i) => i.name), 3)}). New variants can be added without editing callers.`,
              evidence: { entities: [abstraction.name, ...implementors.map((i) => i.name)] },
            }),
          );
        } else {
          findings.push(
            ruleFinding({
              ruleId: this.id,
              criterionId: this.criterionId,
              kind: 'suggestion',
              severity: 'minor',
              key: point.id,
              title: `${abstraction.name} has no implementations`,
              message: `${abstraction.name} is the right seam for ${point.name.toLowerCase()}, but no class implements it, so the design does not show how variants plug in.`,
              suggestion: `Add one or two concrete implementations (for example, the default one and the one the requirements hint at).`,
              evidence: { entities: [abstraction.name] },
            }),
          );
        }
        continue;
      }
      const concrete = related[0];
      findings.push(
        ruleFinding({
          ruleId: this.id,
          criterionId: this.criterionId,
          kind: 'issue',
          severity: 'major',
          key: point.id,
          title: concrete
            ? `${point.name} is hard-wired in ${concrete.name}`
            : `No seam for ${point.name.toLowerCase()}`,
          message: concrete
            ? `${point.description} ${concrete.name} is a concrete ${concrete.kind}, so each new variant means editing it (and re-testing everything that uses it).`
            : `${point.description} Nothing in your design isolates this, so the change would land inside whichever class currently does it.`,
          suggestion: `Introduce an interface for ${point.name.toLowerCase()} (e.g. a strategy or policy object) and let the owning class depend on the interface.`,
          evidence: concrete ? { entities: [concrete.name] } : {},
        }),
      );
    }
    return findings;
  }
}

export class PatternJustificationRule implements DesignRule {
  readonly id = 'pattern-justification';
  readonly criterionId = 'extensibility' as const;

  check(index: DesignIndex): Finding[] {
    const findings: Finding[] = [];
    const patterns = index.design.patterns;
    if (patterns.length === 0) {
      return [
        ruleFinding({
          ruleId: this.id,
          criterionId: this.criterionId,
          kind: 'suggestion',
          severity: 'info',
          key: 'none',
          title: 'No design patterns named',
          message: 'Patterns are not required, but naming the ones you use (and why) makes your intent obvious to a reviewer.',
          suggestion: 'If a class hierarchy exists to swap behaviour, say which pattern it is and what problem it solves here.',
        }),
      ];
    }
    for (const pattern of patterns) {
      const words = wordCount(pattern.justification);
      const unknown = pattern.appliedTo.filter((name) => !index.has(name));
      if (words < 8) {
        findings.push(
          ruleFinding({
            ruleId: this.id,
            criterionId: this.criterionId,
            kind: 'issue',
            severity: 'minor',
            key: pattern.name,
            title: `${pattern.name}: justification is too thin`,
            message: words === 0
              ? `You named ${pattern.name} but did not say why. Naming a pattern without a reason reads as pattern-matching rather than design.`
              : `"${pattern.justification}" does not explain which change ${pattern.name} protects against.`,
            suggestion: `Complete the sentence: "Without ${pattern.name}, adding ___ would require changing ___."`,
            evidence: { entities: pattern.appliedTo.filter((n) => index.has(n)) },
          }),
        );
      }
      if (pattern.appliedTo.length === 0 || unknown.length === pattern.appliedTo.length) {
        findings.push(
          ruleFinding({
            ruleId: this.id,
            criterionId: this.criterionId,
            kind: 'issue',
            severity: 'minor',
            key: `${pattern.name}-where`,
            title: `${pattern.name} is not tied to your classes`,
            message: `Say which classes play a role in ${pattern.name}${unknown.length ? ` — ${listToSentence(unknown)} ${unknown.length === 1 ? 'is' : 'are'} not in your design` : ''}.`,
            suggestion: 'Select the participating classes in the Patterns tab.',
          }),
        );
      } else if (words >= 15) {
        findings.push(
          ruleFinding({
            ruleId: this.id,
            criterionId: this.criterionId,
            kind: 'strength',
            severity: 'info',
            key: `${pattern.name}-ok`,
            title: `${pattern.name} is applied with a reason`,
            message: `You tie ${pattern.name} to ${listToSentence(pattern.appliedTo.filter((n) => index.has(n)), 3)} and explain why.`,
            evidence: { entities: pattern.appliedTo.filter((n) => index.has(n)) },
          }),
        );
      }
    }
    return findings;
  }
}

/** The "what if" question: does the learner show where a change lands? */
export class ExtensionScenarioRule implements DesignRule {
  readonly id = 'extension-scenario';
  readonly criterionId = 'extensibility' as const;

  check(index: DesignIndex, problem: Problem): Finding[] {
    const answer = index.design.extensionAnswer;
    const words = wordCount(answer);
    if (words === 0) {
      return [
        ruleFinding({
          ruleId: this.id,
          criterionId: this.criterionId,
          kind: 'issue',
          severity: 'major',
          key: 'missing',
          title: 'Extension scenario not answered',
          message: `You did not answer: "${problem.extensionScenario.prompt}" This question is how interviewers test whether a design really is extensible.`,
          suggestion: 'List the classes you would add, the ones you would change, and — most importantly — the ones that stay untouched.',
        }),
      ];
    }
    const referenced = index.entities.filter((e) => new RegExp(`\\b${escapeRegExp(e.name)}\\b`, 'i').test(answer));
    const keywordHits = mentionsAny(answer, problem.extensionScenario.keywords);
    if (words < 25 || referenced.length === 0) {
      return [
        ruleFinding({
          ruleId: this.id,
          criterionId: this.criterionId,
          kind: 'issue',
          severity: 'minor',
          key: 'shallow',
          title: 'Extension answer is too general',
          message: referenced.length === 0
            ? 'Your answer does not mention any class from your design, so it is hard to verify the change really is contained.'
            : `At ${words} words, the answer does not yet walk through the change.`,
          suggestion: 'Name the exact classes: "Add X implementing Y; register it in Z; A, B and C are untouched."',
          evidence: { entities: referenced.map((e) => e.name) },
        }),
      ];
    }
    return [
      ruleFinding({
        ruleId: this.id,
        criterionId: this.criterionId,
        kind: 'strength',
        severity: 'info',
        key: 'good',
        title: 'Extension scenario is walked through concretely',
        message: `Your answer references ${listToSentence(referenced.map((e) => e.name), 3)}${keywordHits.length ? ` and addresses ${listToSentence(keywordHits, 3)}` : ''}.`,
        evidence: { entities: referenced.map((e) => e.name) },
      }),
    ];
  }
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
