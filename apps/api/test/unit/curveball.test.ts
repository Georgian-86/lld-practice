import { describe, expect, it } from 'vitest';
import type { DesignModel } from '@blueprint/shared';
import { CurveballService, pickTarget, templateCurveball } from '../../src/application/curveball-service';
import type { LlmClient } from '../../src/evaluation/llm/llm-client';
import { goodParkingDesign } from '../fixtures/designs';
import { catalog, problem } from '../fixtures/harness';

/** The good design without its allocation seam: SpotAllocationStrategy and its implementation removed. */
function withoutAllocationSeam(): DesignModel {
  const design = goodParkingDesign();
  const gone = new Set(['SpotAllocationStrategy', 'NearestSpotAllocation']);
  design.entities = design.entities.filter((e) => !gone.has(e.name));
  design.relationships = design.relationships.filter((r) => !gone.has(r.from) && !gone.has(r.to));
  design.entities.push({ id: 'x', name: 'SpotAllocator', kind: 'class', responsibilities: ['Picks the nearest free spot'], attributes: [], methods: [] });
  return design;
}

describe('pickTarget', () => {
  it('aims at a point of change that has no abstraction, and names the class holding it', () => {
    expect(pickTarget(problem(), withoutAllocationSeam())).toEqual({
      variationPointId: 'allocation',
      name: 'Spot allocation',
      status: 'missing',
      heldBy: 'SpotAllocator',
    });
  });

  it('falls back to the least-covered seam when every point of change is abstracted', () => {
    const target = pickTarget(problem(), goodParkingDesign());
    expect(target.status).toBe('covered');
    expect(target.variationPointId).toBe('pricing'); // all have one implementation; ties keep the problem's order
  });

  it('words a template that names the weak spot without suggesting a solution', () => {
    const t = templateCurveball(problem(), pickTarget(problem(), withoutAllocationSeam()));
    expect(t.title).toBe('A new spot allocation');
    expect(t.prompt).toMatch(/^The rule for picking a spot .*\. The business has just asked for one more spot allocation variant/);
    expect(t.prompt).toMatch(/inside SpotAllocator/);
    expect(t.prompt).toMatch(/Which classes change/);
  });
});

describe('CurveballService', () => {
  const submissionFor = (design: DesignModel) => ({
    id: 'sub_1',
    learnerId: 'me',
    problemId: 'parking-lot',
    toSnapshot: () => ({ design }),
  });
  const service = (llm: LlmClient | null, design = withoutAllocationSeam()) =>
    new CurveballService({
      problems: catalog,
      submissions: { findById: async (id: string) => (id === 'sub_1' ? submissionFor(design) : undefined) } as never,
      llm,
    });
  const llmReturning = (text: string): LlmClient => ({ name: 'fake', complete: async () => ({ text, model: 'fake' }) });

  it('uses the model’s wording when it validates', async () => {
    const worded = { title: 'Weekend valet', prompt: 'On weekends a valet parks cars using their own rule for choosing spots. Which classes change and which stay untouched?' };
    const result = await service(llmReturning(JSON.stringify(worded))).adaptive('me', 'sub_1');
    expect(result).toMatchObject({ ...worded, wordedBy: 'ai', variationPoints: ['allocation'] });
  });

  it('falls back to the template when the model fails or answers badly', async () => {
    const bad = await service(llmReturning('{"title":"x"}')).adaptive('me', 'sub_1');
    expect(bad.wordedBy).toBe('template');
    const failing: LlmClient = { name: 'down', complete: async () => Promise.reject(new Error('503')) };
    expect((await service(failing).adaptive('me', 'sub_1')).wordedBy).toBe('template');
    expect((await service(null).adaptive('me', 'sub_1')).title).toBe('A new spot allocation');
  });

  it('hides other learners’ submissions', async () => {
    await expect(service(null).adaptive('someone-else', 'sub_1')).rejects.toThrow(/not found/);
  });
});
