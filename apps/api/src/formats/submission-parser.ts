import type { DesignModel, Draft, SubmissionFormat } from '@blueprint/shared';
import { nameKey, LIMITS } from '@blueprint/shared';

export interface ParseIssue {
  path: string;
  message: string;
}

export type ParseResult =
  | { ok: true; design: DesignModel; warnings: ParseIssue[] }
  | { ok: false; errors: ParseIssue[] };

/**
 * Strategy: turns one submission format into the normalised DesignModel.
 * Adding a format (e.g. a Java/TS code skeleton) means adding one parser and
 * registering it — no evaluator changes.
 */
export interface SubmissionParser<F extends SubmissionFormat = SubmissionFormat> {
  readonly format: F;
  parse(draft: Extract<Draft, { format: F }>): ParseResult;
}

/**
 * The minimum bar for a submission to be *evaluable*. Everything beyond this
 * is feedback, not a rejection — we never refuse a weak design, we explain it.
 */
export function validateEvaluable(design: DesignModel): ParseIssue[] {
  const issues: ParseIssue[] = [];
  const named = design.entities.filter((e) => e.name.trim().length > 0);
  if (named.length < 2) {
    issues.push({ path: 'entities', message: 'Add at least two named classes or interfaces before submitting.' });
  }
  if (design.entities.length !== named.length) {
    issues.push({ path: 'entities', message: 'Every class needs a name. Remove or name the empty rows.' });
  }
  const seen = new Set<string>();
  for (const entity of named) {
    const key = nameKey(entity.name);
    if (seen.has(key)) {
      issues.push({ path: 'entities', message: `"${entity.name.trim()}" is defined more than once.` });
    }
    seen.add(key);
  }
  if (design.entities.length > LIMITS.maxEntities) {
    issues.push({ path: 'entities', message: `A design can have at most ${LIMITS.maxEntities} classes.` });
  }
  return issues;
}

/** Trims text and drops blank list items so rules see clean data. */
export function normaliseDesign(design: DesignModel): DesignModel {
  const clean = (items: string[]) => items.map((s) => s.trim()).filter(Boolean);
  const requirementMap: Record<string, string[]> = {};
  for (const [requirementId, names] of Object.entries(design.requirementMap)) {
    const cleaned = clean(names);
    if (cleaned.length) requirementMap[requirementId] = cleaned;
  }
  return {
    entities: design.entities.map((e) => ({
      ...e,
      name: e.name.trim(),
      responsibilities: clean(e.responsibilities),
      attributes: clean(e.attributes),
      methods: clean(e.methods),
    })),
    relationships: design.relationships
      .map((r) => ({ ...r, from: r.from.trim(), to: r.to.trim() }))
      .filter((r) => r.from && r.to),
    requirementMap,
    patterns: design.patterns
      .map((p) => ({ ...p, name: p.name.trim(), appliedTo: clean(p.appliedTo), justification: p.justification.trim() }))
      .filter((p) => p.name),
    tradeOffs: clean(design.tradeOffs),
    extensionAnswer: design.extensionAnswer.trim(),
    notes: design.notes.trim(),
    flows: (design.flows ?? [])
      .map((f) => ({
        ...f,
        steps: f.steps
          .map((s) => ({ ...s, from: s.from.trim(), to: s.to.trim(), message: s.message.trim() }))
          .filter((s) => s.from && s.to),
      }))
      .filter((f) => f.steps.length > 0),
  };
}
