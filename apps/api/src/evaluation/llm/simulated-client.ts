import type { CriterionId, DesignModel, Finding, Problem } from '@blueprint/shared';
import { CRITERIA, CRITERION_IDS } from '@blueprint/shared';
import { DesignIndex } from '../design-index';
import { mentionsAny, wordCount } from '../text';
import { LlmError, type LlmClient, type LlmRequest, type LlmResponse } from './llm-client';
import type { AiReview } from './review-schema';

export interface SimulatedClientOptions {
  latencyMs: number;
  /** 0..1 probability of a simulated transient failure, for demoing resilience. */
  failureRate: number;
  random?: () => number;
}

const DEDUCTION = { critical: 2, major: 1, minor: 0.35, info: 0 } as const;

/**
 * Offline stand-in for the AI reviewer so the full product works with no API
 * key. It exercises the exact same path as a real model (JSON text → schema
 * validation → guardrails), and is clearly labelled "simulated" in the UI.
 * Its heuristics are intentionally modest; it is a demo aid, not an oracle.
 */
export class SimulatedLlmClient implements LlmClient {
  readonly name = 'simulated-reviewer';
  private readonly random: () => number;

  constructor(private readonly options: SimulatedClientOptions) {
    this.random = options.random ?? Math.random;
  }

  async complete(request: LlmRequest, signal?: AbortSignal): Promise<LlmResponse> {
    await delay(this.options.latencyMs, signal);
    if (this.random() < this.options.failureRate) {
      throw new LlmError('Simulated AI outage (LLM_SIMULATED_FAILURE_RATE).', true);
    }
    const { problem, design, facts } = request.grounding;
    return { text: JSON.stringify(simulateReview(problem, design, facts)), model: 'simulated' };
  }
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ms <= 0) return resolve();
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new LlmError('Aborted', true));
      },
      { once: true },
    );
  });
}

export function simulateReview(problem: Problem, design: DesignModel, facts: Finding[]): AiReview {
  const index = new DesignIndex(design);
  const allText = [
    ...design.entities.map((e) => index.describe(e)),
    ...design.tradeOffs,
    design.extensionAnswer,
    design.notes,
    ...design.patterns.map((p) => p.justification),
  ].join(' ');

  // Ratings start from the deterministic picture and are nudged by qualitative signals.
  const ratings = {} as Record<CriterionId, number>;
  for (const id of CRITERION_IDS) {
    const penalty = facts
      .filter((f) => f.criterionId === id && f.kind !== 'strength')
      .reduce((sum, f) => sum + DEDUCTION[f.severity], 0);
    const bonus = facts.some((f) => f.criterionId === id && f.kind === 'strength') ? 0.5 : 0;
    ratings[id] = 4.5 - penalty + bonus;
  }
  const responsibilityWords = design.entities.flatMap((e) => e.responsibilities).map(wordCount);
  const avgWords = responsibilityWords.length
    ? responsibilityWords.reduce((a, b) => a + b, 0) / responsibilityWords.length
    : 0;
  if (avgWords > 0 && avgWords < 4) ratings.responsibilities -= 0.75;
  const abstractions = design.entities.filter((e) => index.isAbstraction(e));
  const polymorphic = abstractions.filter((a) => index.implementorsOf(a.name).length >= 2);
  if (polymorphic.length >= 2) ratings.extensibility += 0.5;

  const findings: AiReview['findings'] = [];

  // 1. The hub class: most designs have an orchestrator that is at risk of bloating.
  const hub = [...design.entities].sort((a, b) => index.degree(b.name) - index.degree(a.name))[0];
  if (hub && index.degree(hub.name) >= 4) {
    findings.push({
      criterionId: 'responsibilities',
      kind: 'suggestion',
      severity: 'minor',
      title: `Keep ${hub.name} a coordinator`,
      message: `${hub.name} talks to ${index.degree(hub.name)} classes, so it is the natural orchestrator of the main flow. That is a good place for workflow, but a risky place for business rules.`,
      suggestion: `Let ${hub.name} sequence the steps and delegate each decision (selection, pricing, validation) to the collaborator that owns it.`,
      entities: [hub.name],
    });
  }

  // 2. Concurrency, when the problem demands it.
  const needsConcurrency = problem.nonFunctionalRequirements.some((r) =>
    /same time|concurren|simultaneous|never be assigned/i.test(r.text),
  );
  if (needsConcurrency) {
    const handled = mentionsAny(allText, ['lock', 'synchronized', 'synchronised', 'atomic', 'concurrency', 'concurrent', 'thread', 'mutex', 'compare-and-set', 'cas']).length > 0;
    findings.push(
      handled
        ? {
            criterionId: 'tradeoffs',
            kind: 'strength',
            severity: 'info',
            title: 'Concurrency is considered',
            message: 'You address how simultaneous requests are kept consistent, which many first attempts miss.',
            suggestion: '',
            entities: [],
          }
        : {
            criterionId: 'responsibilities',
            kind: 'issue',
            severity: 'major',
            title: 'Concurrency is not addressed',
            message: `The requirements say simultaneous requests must stay consistent, but no class states how it guarantees this.`,
            suggestion: 'Name the single class that performs "find and reserve" and state how it is made atomic (a lock per floor/resource, a synchronized method, or compare-and-set on the resource state).',
            entities: [],
          },
    );
  }

  // 3. Polymorphism done well.
  if (polymorphic.length > 0) {
    const a = polymorphic[0]!;
    findings.push({
      criterionId: 'extensibility',
      kind: 'strength',
      severity: 'info',
      title: `${a.name} is a real extension point`,
      message: `${a.name} has ${index.implementorsOf(a.name).length} implementations, so callers can depend on the abstraction and new variants slot in without edits.`,
      suggestion: '',
      entities: [a.name, ...index.implementorsOf(a.name).map((e) => e.name)],
    });
  }

  // 4. Enums sitting on a point of change.
  for (const point of problem.variationPoints) {
    const enumOnPoint = design.entities.find((e) => e.kind === 'enum' && mentionsAny(e.name, point.keywords).length > 0);
    if (enumOnPoint) {
      findings.push({
        criterionId: 'extensibility',
        kind: 'suggestion',
        severity: 'minor',
        title: `${enumOnPoint.name} may limit ${point.name.toLowerCase()}`,
        message: `An enum is fine while the set of options is fixed, but ${point.description.toLowerCase()} Each new option then means editing every switch over ${enumOnPoint.name}.`,
        suggestion: `If you expect new variants, replace the enum with an interface; keep the enum only if the set is truly closed.`,
        entities: [enumOnPoint.name],
      });
      break;
    }
  }

  // 5. Open/closed reasoning in the extension answer.
  if (/untouched|unchanged|no change|without (changing|modifying)|stays? the same/i.test(design.extensionAnswer)) {
    findings.push({
      criterionId: 'extensibility',
      kind: 'strength',
      severity: 'info',
      title: 'You reason about what does not change',
      message: 'Your extension answer names what stays untouched — that is exactly the Open/Closed argument reviewers look for.',
      suggestion: '',
      entities: [],
    });
  }

  const alternatives: AiReview['alternatives'] = problem.variationPoints.slice(0, 2).map((point) => {
    const abstracted = design.entities.some(
      (e) => index.isAbstraction(e) && mentionsAny(e.name, point.keywords).length > 0,
    );
    return abstracted
      ? {
          title: `A simple enum for ${point.name.toLowerCase()}`,
          description: `Instead of an interface hierarchy, an enum with a switch in one place can express ${point.name.toLowerCase()}.`,
          whenBetter: 'When the set of variants is small, stable and known up front — fewer classes and easier to read.',
        }
      : {
          title: `A strategy object for ${point.name.toLowerCase()}`,
          description: `Move ${point.name.toLowerCase()} behind an interface that the owning class receives through its constructor.`,
          whenBetter: `When ${point.description.charAt(0).toLowerCase()}${point.description.slice(1)}`,
        };
  });

  const clamp = (n: number) => Math.max(1, Math.min(5, Math.round(n)));
  const ordered = CRITERION_IDS.map((id) => ({ id, rating: clamp(ratings[id]) }));
  const best = [...ordered].sort((a, b) => b.rating - a.rating)[0]!;
  const worst = [...ordered].sort((a, b) => a.rating - b.rating)[0]!;
  const topIssue =
    facts.find((f) => f.kind === 'issue' && (f.severity === 'critical' || f.severity === 'major')) ??
    facts.find((f) => f.kind === 'issue');

  return {
    summary: `A ${design.entities.length}-class design with ${design.relationships.length} relationships. Your strongest area is ${CRITERIA[best.id].name.toLowerCase()}; the biggest opportunity is ${CRITERIA[worst.id].name.toLowerCase()}.`,
    criteria: ordered.map(({ id, rating }) => ({
      criterionId: id,
      rating,
      rationale: rationaleFor(id, rating, facts),
    })),
    findings: findings.slice(0, 5),
    alternatives,
    nextStep: topIssue?.suggestion ?? 'Pick one variation point and write the class-level walkthrough of adding a new variant.',
  };
}

function rationaleFor(id: CriterionId, rating: number, facts: Finding[]): string {
  const relevant = facts.filter((f) => f.criterionId === id);
  const issues = relevant.filter((f) => f.kind === 'issue');
  const strengths = relevant.filter((f) => f.kind === 'strength');
  if (rating >= 4 && strengths[0]) return `${strengths[0].title}.${issues.length ? ` Minor gaps remain: ${issues[0]!.title.toLowerCase()}.` : ''}`;
  if (issues[0]) return `Held back mainly by: ${issues[0].title.toLowerCase()}.`;
  return rating >= 4 ? 'Solid, with no significant gaps found.' : 'Acceptable, but could be made more explicit.';
}
