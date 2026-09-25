import type { Finding } from '@blueprint/shared';
import type { DesignIndex } from '../design-index';
import type { DesignRule } from '../evaluator';
import { mentionsAny, wordCount } from '../text';
import { ruleFinding } from './finding';

const REASONING_MARKERS = ['because', 'instead', 'rather', 'cost', 'trade', 'simpler', 'simple', 'but', 'however', 'downside', 'versus', 'vs', 'over', 'alternative', 'chose', 'choose', 'avoid'];

/**
 * A rule can't judge whether a trade-off is *wise* (that's the LLM's job),
 * but it can check that trade-offs exist, are more than slogans, and compare
 * options rather than just stating a decision.
 */
export class TradeOffRule implements DesignRule {
  readonly id = 'trade-offs';
  readonly criterionId = 'tradeoffs' as const;

  check(index: DesignIndex): Finding[] {
    const tradeOffs = index.design.tradeOffs;
    if (tradeOffs.length === 0) {
      return [
        ruleFinding({
          ruleId: this.id,
          criterionId: this.criterionId,
          kind: 'issue',
          // The whole criterion has no evidence, so this caps it (see SCORING.criticalCap).
          severity: 'critical',
          key: 'none',
          title: 'No trade-offs discussed',
          message: 'Every design choice has a cost. Without trade-offs, a reviewer cannot tell whether choices were deliberate.',
          suggestion: 'Write 2–3 decisions in the form "I chose A over B because …, at the cost of …".',
        }),
      ];
    }
    const findings: Finding[] = [];
    const terse = tradeOffs.filter((t) => wordCount(t) < 10);
    const reasoned = tradeOffs.filter((t) => wordCount(t) >= 10 && mentionsAny(t, REASONING_MARKERS).length > 0);
    if (terse.length) {
      findings.push(
        ruleFinding({
          ruleId: this.id,
          criterionId: this.criterionId,
          kind: 'issue',
          severity: 'minor',
          key: 'terse',
          title: `${terse.length} trade-off${terse.length === 1 ? ' is' : 's are'} a slogan, not a trade-off`,
          message: `"${terse[0]!.slice(0, 80)}" states a choice without the alternative or its cost.`,
          suggestion: 'Name what you gave up: "A over B because …, at the cost of …".',
        }),
      );
    }
    if (reasoned.length >= 2) {
      findings.push(
        ruleFinding({
          ruleId: this.id,
          criterionId: this.criterionId,
          kind: 'strength',
          severity: 'info',
          key: 'reasoned',
          title: 'Trade-offs are reasoned',
          message: `${reasoned.length} of your trade-offs compare options and explain the cost of the choice.`,
        }),
      );
    } else if (tradeOffs.length < 2) {
      findings.push(
        ruleFinding({
          ruleId: this.id,
          criterionId: this.criterionId,
          kind: 'suggestion',
          severity: 'minor',
          key: 'few',
          title: 'Only one trade-off discussed',
          message: 'Strong answers usually discuss at least two decisions — for example concurrency handling and where the extensibility seams are.',
          suggestion: 'Add a second trade-off about a different part of the design.',
        }),
      );
    }
    return findings;
  }
}
