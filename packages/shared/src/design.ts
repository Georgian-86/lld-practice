import { z } from 'zod';

/**
 * The normalised design model ("design IR").
 *
 * Every submission format (structured editor, Mermaid class diagram, ...) is
 * parsed into this shape, and every evaluator only ever reads this shape. That
 * single seam is what lets new formats and new evaluators be added
 * independently of each other.
 */

export const LIMITS = {
  maxEntities: 60,
  maxRelationships: 200,
  maxListItems: 40,
  maxShortText: 120,
  maxLongText: 4000,
} as const;

export const ENTITY_KINDS = ['class', 'interface', 'abstract', 'enum'] as const;
export type EntityKind = (typeof ENTITY_KINDS)[number];

export const RELATIONSHIP_TYPES = [
  'association',
  'aggregation',
  'composition',
  'inheritance',
  'implementation',
  'dependency',
] as const;
export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];

export const RELATIONSHIP_LABELS: Record<RelationshipType, string> = {
  association: 'Association',
  aggregation: 'Aggregation (has-a, shared)',
  composition: 'Composition (owns, lifecycle-bound)',
  inheritance: 'Inheritance (extends)',
  implementation: 'Implementation (implements)',
  dependency: 'Dependency (uses)',
};

const shortText = z.string().trim().max(LIMITS.maxShortText);
const longText = z.string().max(LIMITS.maxLongText);
const textList = z.array(z.string().max(LIMITS.maxShortText * 2)).max(LIMITS.maxListItems);

export const entitySchema = z.object({
  id: z.string().min(1).max(64),
  name: shortText,
  kind: z.enum(ENTITY_KINDS),
  responsibilities: textList,
  attributes: textList,
  methods: textList,
});
export type Entity = z.infer<typeof entitySchema>;

export const relationshipSchema = z.object({
  id: z.string().min(1).max(64),
  from: shortText,
  to: shortText,
  type: z.enum(RELATIONSHIP_TYPES),
  label: shortText.optional(),
  multiplicity: shortText.optional(),
});
export type Relationship = z.infer<typeof relationshipSchema>;

export const patternUsageSchema = z.object({
  id: z.string().min(1).max(64),
  name: shortText,
  appliedTo: z.array(shortText).max(LIMITS.maxListItems),
  justification: longText,
});
export type PatternUsage = z.infer<typeof patternUsageSchema>;

/** One call in a scenario walkthrough: `from` asks `to` to do `message`. */
export const flowStepSchema = z.object({
  id: z.string().min(1).max(64),
  from: shortText,
  to: shortText,
  message: shortText,
});
export type FlowStep = z.infer<typeof flowStepSchema>;

/**
 * A scenario walkthrough: the ordered calls that fulfil one requirement.
 * Makes collaboration checkable: a class can only call what it knows about.
 */
export const flowSchema = z.object({
  id: z.string().min(1).max(64),
  requirementId: z.string().max(32),
  steps: z.array(flowStepSchema).max(30),
});
export type Flow = z.infer<typeof flowSchema>;

export const designModelSchema = z.object({
  entities: z.array(entitySchema).max(LIMITS.maxEntities),
  relationships: z.array(relationshipSchema).max(LIMITS.maxRelationships),
  /** requirementId -> entity names that fulfil it */
  requirementMap: z.record(z.string().max(32), z.array(shortText).max(LIMITS.maxListItems)),
  patterns: z.array(patternUsageSchema).max(LIMITS.maxListItems),
  tradeOffs: z.array(z.string().max(LIMITS.maxLongText)).max(LIMITS.maxListItems),
  extensionAnswer: longText,
  notes: longText,
  /** Scenario walkthroughs. Optional so drafts saved before scenarios existed stay valid. */
  flows: z.array(flowSchema).max(20).optional(),
});
export type DesignModel = z.infer<typeof designModelSchema>;

export function emptyDesign(): DesignModel {
  return {
    entities: [],
    relationships: [],
    requirementMap: {},
    patterns: [],
    tradeOffs: [],
    extensionAnswer: '',
    notes: '',
    flows: [],
  };
}

/* ------------------------------------------------------------------------ */
/* Submission formats                                                        */
/* ------------------------------------------------------------------------ */

export const SUBMISSION_FORMATS = ['structured', 'mermaid'] as const;
export type SubmissionFormat = (typeof SUBMISSION_FORMATS)[number];

/**
 * What the learner is editing. `structured` drafts carry the whole design.
 * `mermaid` drafts carry a class diagram as source text; entities and
 * relationships come from the diagram while the written sections
 * (traceability, patterns, trade-offs, extension) come from `design`.
 */
/** Where each class box sits on the canvas, keyed by entity id. Presentation only: never evaluated. */
export const layoutSchema = z
  .record(z.string().max(64), z.object({ x: z.number().finite(), y: z.number().finite() }))
  .refine((l) => Object.keys(l).length <= LIMITS.maxEntities * 2, 'Too many layout entries');
export type DiagramLayout = z.infer<typeof layoutSchema>;

/**
 * An accepted "curveball": the interviewer's change request (the problem's
 * extension scenario), taken on after the given version was reviewed.
 * Presentation and framing only: never evaluated.
 */
export const challengeSchema = z.object({
  kind: z.literal('curveball'),
  fromVersion: z.number().int().min(1).max(1000),
  /** Which of the problem's curveballs; absent on older drafts (means the first). */
  curveballId: z.string().max(64).optional(),
  acceptedAt: z.string().max(40),
});
export type Challenge = z.infer<typeof challengeSchema>;

/** Interview mode: a countdown started by the learner. Cleared after each submission. */
export const timerSchema = z.object({
  startedAt: z.string().max(40),
  minutes: z.number().int().min(5).max(240),
});
export type InterviewTimer = z.infer<typeof timerSchema>;

export const draftSchema = z.discriminatedUnion('format', [
  z.object({
    format: z.literal('structured'),
    design: designModelSchema,
    layout: layoutSchema.optional(),
    challenge: challengeSchema.optional(),
    timer: timerSchema.optional(),
  }),
  z.object({
    format: z.literal('mermaid'),
    design: designModelSchema,
    mermaid: z.string().max(LIMITS.maxLongText * 5),
    layout: layoutSchema.optional(),
    challenge: challengeSchema.optional(),
    timer: timerSchema.optional(),
  }),
]);
export type Draft = z.infer<typeof draftSchema>;

export function emptyDraft(): Draft {
  return { format: 'structured', design: emptyDesign() };
}

/** Case/whitespace-insensitive key used to match entity names across the model. */
export function nameKey(name: string): string {
  return name.trim().toLowerCase();
}
