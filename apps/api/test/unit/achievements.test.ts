import { describe, expect, it } from 'vitest';
import type { DesignModel, Draft, EvaluationReport } from '@blueprint/shared';
import { emptyDesign } from '@blueprint/shared';
import { computeAchievements } from '../../src/application/achievements';
import type { SubmissionSnapshot } from '../../src/domain/submission';

const cls = (id: string, name: string, kind: 'class' | 'interface' = 'class') => ({ id, name, kind, responsibilities: [], attributes: [], methods: [] });
const baseDesign: DesignModel = {
  ...emptyDesign(),
  entities: [cls('e1', 'Lot'), cls('e2', 'Pricing', 'interface'), cls('e3', 'Hourly')],
  relationships: [
    { id: 'r1', from: 'Lot', to: 'Pricing', type: 'association' },
    { id: 'r2', from: 'Hourly', to: 'Pricing', type: 'implementation' },
  ],
};

let n = 0;
function sub(partial: Partial<SubmissionSnapshot> & { design?: DesignModel; extra?: Partial<Draft> }): SubmissionSnapshot {
  n++;
  const design = partial.design ?? baseDesign;
  return {
    id: `s${n}`,
    attemptId: 'a1',
    learnerId: 'l',
    problemId: 'parking-lot',
    version: 1,
    format: 'structured',
    draft: { format: 'structured', design, ...(partial.extra ?? {}) } as Draft,
    design,
    contentHash: `h${n}`,
    hintsUsed: 0,
    status: 'evaluated',
    statusMessage: null,
    submittedAt: `2026-01-01T00:0${n}:00.000Z`,
    updatedAt: `2026-01-01T00:0${n}:00.000Z`,
    ...partial,
  };
}
const report = (submissionId: string, overallScore: number) => ({ submissionId, overallScore }) as EvaluationReport;
const problems = [
  { id: 'parking-lot', difficulty: 'easy' as const },
  { id: 'elevator-system', difficulty: 'hard' as const },
];
const earned = (list: ReturnType<typeof computeAchievements>) => list.filter((a) => a.earnedAt).map((a) => a.id);

describe('computeAchievements', () => {
  it('earns nothing with no submissions, and reports catalogue progress', () => {
    const list = computeAchievements({ submissions: [], reports: new Map(), problems });
    expect(earned(list)).toEqual([]);
    expect(list.find((a) => a.id === 'full-catalogue')!.progress).toEqual({ current: 0, target: 2 });
  });

  it('rewards revising a design into a better score, dated by the qualifying version', () => {
    const v1 = sub({ version: 1, hintsUsed: 2 });
    const v2 = sub({ version: 2, hintsUsed: 2 });
    const list = computeAchievements({ submissions: [v2, v1], reports: new Map([[v1.id, report(v1.id, 60)], [v2.id, report(v2.id, 75)]]), problems });
    expect(earned(list)).toEqual(['first-blueprint', 'iterator']);
    expect(list.find((a) => a.id === 'iterator')!.earnedAt).toBe(v2.submittedAt);
  });

  it('recognises a curveball absorbed through an existing abstraction', () => {
    const v1 = sub({ version: 1 });
    const extended: DesignModel = {
      ...baseDesign,
      entities: [...baseDesign.entities, cls('e4', 'EvPricing')],
      relationships: [...baseDesign.relationships, { id: 'r3', from: 'EvPricing', to: 'Pricing', type: 'implementation' }],
    };
    const v2 = sub({ version: 2, design: extended, extra: { challenge: { kind: 'curveball', fromVersion: 1, acceptedAt: 'x' } } });
    const list = computeAchievements({ submissions: [v1, v2], reports: new Map(), problems });
    expect(earned(list)).toEqual(['open-closed', 'seam-finder']);
  });

  it('beat the clock needs a good score within the time', () => {
    const inTime = sub({ extra: { timer: { startedAt: '2026-01-01T00:00:00.000Z', minutes: 45 } } });
    const list = computeAchievements({ submissions: [inTime], reports: new Map([[inTime.id, report(inTime.id, 92)]]), problems });
    expect(earned(list)).toEqual(expect.arrayContaining(['beat-the-clock', 'no-hints', 'ninety-club']));
    const late = sub({ extra: { timer: { startedAt: '2025-12-31T00:00:00.000Z', minutes: 45 } } });
    expect(earned(computeAchievements({ submissions: [late], reports: new Map([[late.id, report(late.id, 92)]]), problems }))).not.toContain('beat-the-clock');
  });

  it('counts the catalogue and hard problems', () => {
    const a = sub({ problemId: 'parking-lot' });
    const b = sub({ problemId: 'elevator-system', attemptId: 'a2' });
    const list = computeAchievements({ submissions: [a, b], reports: new Map([[a.id, report(a.id, 50)], [b.id, report(b.id, 71)]]), problems });
    expect(list.find((x) => x.id === 'full-catalogue')).toMatchObject({ earnedAt: b.submittedAt, progress: { current: 2, target: 2 } });
    expect(earned(list)).toContain('hard-mode');
  });
});
