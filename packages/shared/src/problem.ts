import { z } from 'zod';

/**
 * Rubric criteria are a fixed vocabulary shared by all problems; each problem
 * decides how much each one weighs. A fixed vocabulary keeps scores comparable
 * across problems and lets deterministic rules target criteria by id.
 */
export const CRITERION_IDS = [
  'requirements',
  'modelling',
  'responsibilities',
  'relationships',
  'extensibility',
  'tradeoffs',
] as const;
export type CriterionId = (typeof CRITERION_IDS)[number];

export const CRITERIA: Record<CriterionId, { name: string; description: string }> = {
  requirements: {
    name: 'Requirement coverage',
    description: 'Every functional requirement is owned by at least one part of the design.',
  },
  modelling: {
    name: 'Domain modelling',
    description: 'The core concepts of the problem appear as well-named entities.',
  },
  responsibilities: {
    name: 'Responsibilities & cohesion',
    description: 'Each class has a focused, clearly stated job (single responsibility).',
  },
  relationships: {
    name: 'Relationships & coupling',
    description: 'Relationships are correct, consistent and avoid needless coupling.',
  },
  extensibility: {
    name: 'Extensibility & patterns',
    description: 'Things likely to change sit behind abstractions; patterns are justified.',
  },
  tradeoffs: {
    name: 'Trade-offs & reasoning',
    description: 'Design decisions are explained, with alternatives and their costs.',
  },
};

export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const requirementSchema = z.object({
  id: z.string().regex(/^(FR|NFR)-\d+$/),
  text: z.string().min(1),
});
export type Requirement = z.infer<typeof requirementSchema>;

export const problemSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string().min(1),
  difficulty: z.enum(DIFFICULTIES),
  estimatedMinutes: z.number().int().positive(),
  summary: z.string().min(1),
  /** Markdown */
  description: z.string().min(1),
  tags: z.array(z.string()),
  functionalRequirements: z.array(requirementSchema).min(1),
  nonFunctionalRequirements: z.array(requirementSchema),
  constraints: z.array(z.string()),
  /** Concepts a reasonable design is expected to model, with accepted synonyms. */
  coreConcepts: z
    .array(z.object({ name: z.string(), synonyms: z.array(z.string()), essential: z.boolean() }))
    .min(1),
  /** Places where behaviour is expected to vary and should sit behind an abstraction. */
  variationPoints: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        description: z.string(),
        keywords: z.array(z.string()).min(1),
      }),
    )
    .min(1),
  extensionScenario: z.object({
    prompt: z.string().min(1),
    keywords: z.array(z.string()),
  }),
  hints: z.array(z.object({ level: z.number().int().min(1), title: z.string(), text: z.string() })),
  rubric: z.record(z.enum(CRITERION_IDS), z.number().min(0)),
});
export type Problem = z.infer<typeof problemSchema>;
