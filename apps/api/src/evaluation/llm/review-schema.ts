import { z } from 'zod';
import { CRITERION_IDS, FINDING_KINDS, SEVERITIES } from '@blueprint/shared';

/** What we ask the model to return. Validated with Zod after every call. */
export const aiReviewSchema = z.object({
  summary: z.string().min(1).max(1200),
  criteria: z
    .array(
      z.object({
        criterionId: z.enum(CRITERION_IDS),
        rating: z.number().int().min(1).max(5),
        rationale: z.string().min(1).max(600),
      }),
    )
    .max(CRITERION_IDS.length),
  findings: z
    .array(
      z.object({
        criterionId: z.enum(CRITERION_IDS),
        kind: z.enum(FINDING_KINDS),
        severity: z.enum(SEVERITIES),
        title: z.string().min(1).max(120),
        message: z.string().min(1).max(800),
        suggestion: z.string().max(600),
        entities: z.array(z.string().max(120)).max(10),
      }),
    )
    .max(12),
  alternatives: z
    .array(z.object({ title: z.string().max(120), description: z.string().max(600), whenBetter: z.string().max(400) }))
    .max(4),
  nextStep: z.string().max(400),
});
export type AiReview = z.infer<typeof aiReviewSchema>;

/**
 * Hand-written JSON Schema for structured outputs. Kept deliberately simple
 * (no numeric/length bounds) so it stays within what constrained decoding
 * supports; bounds are enforced by the Zod schema above.
 */
export const aiReviewJsonSchema: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'criteria', 'findings', 'alternatives', 'nextStep'],
  properties: {
    summary: { type: 'string' },
    criteria: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['criterionId', 'rating', 'rationale'],
        properties: {
          criterionId: { type: 'string', enum: [...CRITERION_IDS] },
          rating: { type: 'integer', enum: [1, 2, 3, 4, 5] },
          rationale: { type: 'string' },
        },
      },
    },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['criterionId', 'kind', 'severity', 'title', 'message', 'suggestion', 'entities'],
        properties: {
          criterionId: { type: 'string', enum: [...CRITERION_IDS] },
          kind: { type: 'string', enum: [...FINDING_KINDS] },
          severity: { type: 'string', enum: [...SEVERITIES] },
          title: { type: 'string' },
          message: { type: 'string' },
          suggestion: { type: 'string' },
          entities: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    alternatives: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'description', 'whenBetter'],
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          whenBetter: { type: 'string' },
        },
      },
    },
    nextStep: { type: 'string' },
  },
};
