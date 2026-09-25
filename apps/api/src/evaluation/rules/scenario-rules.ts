import type { Finding, Problem } from '@blueprint/shared';
import { analyseFlow, describeStepProblem } from '@blueprint/shared';
import type { DesignIndex } from '../design-index';
import type { DesignRule } from '../evaluator';
import { ruleFinding } from './finding';

/**
 * Scenario walkthroughs test collaboration, not just structure: every call in a
 * scenario must be possible given the relationships drawn. Uses the same
 * analysis the canvas shows live.
 */
export class ScenarioRule implements DesignRule {
  readonly id = 'scenario';
  readonly criterionId = 'relationships' as const;

  check(index: DesignIndex, problem: Problem): Finding[] {
    const flows = (index.design.flows ?? []).filter((f) => f.steps.length > 0);
    if (flows.length === 0) {
      return [
        ruleFinding({
          ruleId: this.id,
          criterionId: this.criterionId,
          kind: 'suggestion',
          severity: 'info',
          key: 'none',
          title: 'Walk through a key scenario',
          message: 'A class diagram can look right and still not work. Tracing one requirement call by call shows whether the classes can actually collaborate.',
          suggestion: `Pick ${problem.functionalRequirements[0]?.id ?? 'a requirement'} and use Scenario mode on the diagram to click through the calls that fulfil it.`,
        }),
      ];
    }
    const findings: Finding[] = [];
    for (const flow of flows) {
      const analysis = analyseFlow(index.design, flow);
      for (const s of analysis.steps) {
        for (const p of s.problems) {
          const severity = p.kind === 'unknown-method' ? 'minor' : 'major';
          findings.push(
            ruleFinding({
              ruleId: this.id,
              criterionId: this.criterionId,
              kind: 'issue',
              severity,
              key: `${flow.requirementId}:${s.step.from}->${s.step.to}:${p.kind}`,
              title:
                p.kind === 'not-navigable'
                  ? `${flow.requirementId} scenario: ${s.step.from} cannot reach ${s.step.to}`
                  : p.kind === 'unknown-method'
                    ? `${flow.requirementId} scenario: ${s.step.to} has no ${p.method}()`
                    : `${flow.requirementId} scenario uses an undefined class`,
              message: `Step ${s.index + 1} (${s.step.from} → ${s.step.to}: ${s.step.message}). ${describeStepProblem(p, s.step)}`,
              suggestion:
                p.kind === 'not-navigable'
                  ? `Add a relationship from ${s.step.from} to ${s.step.to} (or to an interface it implements), or route the call through a class that already knows ${s.step.to}.`
                  : p.kind === 'unknown-method'
                    ? `Declare ${p.method}() on ${s.step.to}, or use one of its existing methods.`
                    : 'Remove the step or add the missing class.',
              evidence: {
                entities: [s.step.from, s.step.to].filter((n) => index.has(n)),
                requirementIds: [flow.requirementId],
              },
            }),
          );
        }
      }
      if (analysis.breaks.length) {
        findings.push(
          ruleFinding({
            ruleId: this.id,
            criterionId: this.criterionId,
            kind: 'issue',
            severity: 'minor',
            key: `${flow.requirementId}:breaks`,
            title: `${flow.requirementId} scenario jumps between unrelated calls`,
            message: `Step ${analysis.breaks.map((b) => b + 1).join(', ')} starts from a class that was never called earlier in the scenario.`,
            suggestion: 'Each call should come from a class already involved in the scenario, so the whole chain is traceable from its entry point.',
            evidence: { requirementIds: [flow.requirementId] },
          }),
        );
      }
      if (analysis.valid && flow.steps.length >= 3) {
        findings.push(
          ruleFinding({
            ruleId: this.id,
            criterionId: this.criterionId,
            kind: 'strength',
            severity: 'info',
            key: flow.requirementId,
            title: `${flow.requirementId} scenario runs end to end`,
            message: `All ${flow.steps.length} calls in the ${flow.requirementId} scenario follow relationships in your design.`,
            evidence: { requirementIds: [flow.requirementId] },
          }),
        );
      }
    }
    return findings;
  }
}
