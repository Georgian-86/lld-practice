import type { EvaluationContext, Evaluator, EvaluatorOutput, DesignRule } from './evaluator';

/** Runs a list of deterministic rules. Same input, same output — always. */
export class RuleBasedEvaluator implements Evaluator {
  readonly id = 'design-rules';
  readonly version = '1.0.0';
  readonly kind = 'deterministic' as const;

  constructor(private readonly rules: DesignRule[]) {}

  async evaluate(context: EvaluationContext): Promise<EvaluatorOutput> {
    const findings = this.rules.flatMap((rule) => rule.check(context.index, context.problem));
    return { findings, detail: `${this.rules.length} deterministic rules` };
  }
}
