import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AttemptDTO, ComparisonDTO, SubmissionDTO } from '@blueprint/shared';
import { emptyDesign } from '@blueprint/shared';
import { LlmError } from '../../src/evaluation/llm/llm-client';
import { goodParkingDesign } from '../fixtures/designs';
import { createTestApp, fakeLlm, LEARNER, OTHER_LEARNER, structured } from '../fixtures/harness';

type TestApp = Awaited<ReturnType<typeof createTestApp>>;

async function startAttempt(t: TestApp, problemId = 'parking-lot'): Promise<AttemptDTO> {
  const res = await t.app.inject({ method: 'POST', url: '/api/attempts', headers: LEARNER, payload: { problemId } });
  expect(res.statusCode).toBe(201);
  return res.json();
}

async function submit(t: TestApp, attemptId: string, design = goodParkingDesign()) {
  return t.app.inject({
    method: 'POST',
    url: `/api/attempts/${attemptId}/submissions`,
    headers: LEARNER,
    payload: structured(design),
  });
}

async function getSubmission(t: TestApp, id: string): Promise<SubmissionDTO> {
  return (await t.app.inject({ url: `/api/submissions/${id}`, headers: LEARNER })).json();
}

describe('practice loop over HTTP', () => {
  let t: TestApp;
  beforeEach(async () => {
    t = await createTestApp();
  });
  afterEach(async () => {
    await t.app.close();
  });

  it('choose → attempt → hint → submit → feedback → improve → compare → history', async () => {
    const problems = (await t.app.inject({ url: '/api/problems', headers: LEARNER })).json();
    expect(problems.map((p: { id: string }) => p.id)).toEqual(['parking-lot', 'library-management', 'vending-machine', 'elevator-system']);

    const detail = (await t.app.inject({ url: '/api/problems/parking-lot' })).json();
    expect(detail.hints[0]).toEqual({ level: 1, title: 'Start from the nouns' }); // hint text is not leaked

    const attempt = await startAttempt(t);
    const hint = await t.app.inject({ method: 'POST', url: `/api/attempts/${attempt.id}/hints`, headers: LEARNER, payload: { level: 1 } });
    expect(hint.json().text).toMatch(/nouns/);

    // v1: a weaker design (no trade-offs, missing mappings)
    const weak = goodParkingDesign();
    weak.tradeOffs = [];
    delete weak.requirementMap['FR-5'];
    const first = await submit(t, attempt.id, weak);
    expect(first.statusCode).toBe(202);
    const v1 = first.json() as SubmissionDTO;
    expect(v1).toMatchObject({ version: 1, status: 'submitted', evaluation: null, pollAfterMs: 1000, hintsUsed: 1 });

    await t.container.worker.drain();
    const v1Done = await getSubmission(t, v1.id);
    expect(v1Done.status).toBe('evaluated');
    expect(v1Done.pollAfterMs).toBeNull();
    expect(v1Done.evaluation?.findings.some((f) => f.title === 'FR-5 has no owner')).toBe(true);

    // v2: apply the feedback
    const v2 = (await submit(t, attempt.id)).json() as SubmissionDTO;
    expect(v2.version).toBe(2);
    await t.container.worker.drain();
    const v2Done = await getSubmission(t, v2.id);
    expect(v2Done.evaluation!.overallScore).toBeGreaterThan(v1Done.evaluation!.overallScore);

    const comparison = (
      await t.app.inject({ url: `/api/compare?base=${v1.id}&target=${v2.id}`, headers: LEARNER })
    ).json() as ComparisonDTO;
    expect(comparison.scoreDelta).toBeGreaterThan(0);
    expect(comparison.resolved.map((f) => f.title)).toEqual(
      expect.arrayContaining(['FR-5 has no owner', 'No trade-offs discussed']),
    );

    const history = (await t.app.inject({ url: `/api/attempts/${attempt.id}`, headers: LEARNER })).json() as AttemptDTO;
    expect(history.submissions.map((s) => [s.version, s.status])).toEqual([
      [1, 'evaluated'],
      [2, 'evaluated'],
    ]);
    expect(history.revealedHints).toHaveLength(1);

    const progress = (await t.app.inject({ url: '/api/progress', headers: LEARNER })).json();
    expect(progress.totals).toMatchObject({ attempts: 1, submissions: 2, problemsPracticed: 1 });
    const catalogue = (await t.app.inject({ url: '/api/problems', headers: LEARNER })).json();
    expect(catalogue[0].progress).toMatchObject({ attempts: 1, submissions: 2, bestScore: v2Done.evaluation!.overallScore });
  });

  it('lints an in-progress design with the same rules as scoring, without storing anything', async () => {
    const design = goodParkingDesign();
    delete design.requirementMap['FR-5'];
    const res = await t.app.inject({ method: 'POST', url: '/api/lint', headers: LEARNER, payload: { problemId: 'parking-lot', design } });
    expect(res.statusCode).toBe(200);
    const titles = res.json().findings.map((f: { title: string }) => f.title);
    expect(titles).toContain('FR-5 has no owner');
    expect((await t.app.inject({ url: '/api/progress', headers: LEARNER })).json().totals.submissions).toBe(0);
    const unknown = await t.app.inject({ method: 'POST', url: '/api/lint', headers: LEARNER, payload: { problemId: 'nope', design } });
    expect(unknown.statusCode).toBe(404);
  });

  it('autosaves drafts', async () => {
    const attempt = await startAttempt(t);
    const res = await t.app.inject({
      method: 'PUT',
      url: `/api/attempts/${attempt.id}/draft`,
      headers: LEARNER,
      payload: structured(goodParkingDesign()),
    });
    expect(res.statusCode).toBe(200);
    const reloaded = (await t.app.inject({ url: `/api/attempts/${attempt.id}`, headers: LEARNER })).json();
    expect(reloaded.draft.design.entities).toHaveLength(goodParkingDesign().entities.length);
  });
});

describe('failure and edge cases', () => {
  let t: TestApp;
  afterEach(async () => {
    await t.app.close();
  });

  it('404s for unknown problems, attempts and routes', async () => {
    t = await createTestApp();
    expect((await t.app.inject({ url: '/api/problems/nope' })).statusCode).toBe(404);
    const start = await t.app.inject({ method: 'POST', url: '/api/attempts', headers: LEARNER, payload: { problemId: 'nope' } });
    expect(start.json()).toMatchObject({ error: { code: 'not_found' } });
    expect((await t.app.inject({ url: '/api/attempts/att_missing', headers: LEARNER })).statusCode).toBe(404);
    expect((await t.app.inject({ url: '/api/does-not-exist' })).statusCode).toBe(404);
  });

  it('hides one learner’s attempts and submissions from another', async () => {
    t = await createTestApp();
    const attempt = await startAttempt(t);
    const sub = (await submit(t, attempt.id)).json();
    expect((await t.app.inject({ url: `/api/attempts/${attempt.id}`, headers: OTHER_LEARNER })).statusCode).toBe(404);
    expect((await t.app.inject({ url: `/api/submissions/${sub.id}`, headers: OTHER_LEARNER })).statusCode).toBe(404);
  });

  it('400s on a malformed body and 422s on an un-evaluable design', async () => {
    t = await createTestApp();
    const attempt = await startAttempt(t);
    const malformed = await t.app.inject({
      method: 'POST',
      url: `/api/attempts/${attempt.id}/submissions`,
      headers: LEARNER,
      payload: { draft: { format: 'uml-image' } },
    });
    expect(malformed.statusCode).toBe(400);
    expect(malformed.json().error.code).toBe('invalid_request');

    const empty = await submit(t, attempt.id, emptyDesign());
    expect(empty.statusCode).toBe(422);
    expect(empty.json().error.message).toBe('Add at least two named classes or interfaces before submitting.');
  });

  it('rejects oversized designs', async () => {
    t = await createTestApp();
    const attempt = await startAttempt(t);
    const huge = goodParkingDesign();
    huge.entities = Array.from({ length: 61 }, (_, i) => ({ ...huge.entities[0]!, id: `x${i}`, name: `C${i}` }));
    expect((await submit(t, attempt.id, huge)).statusCode).toBe(400);
  });

  it('409s on a duplicate submission and on submitting while one is being evaluated', async () => {
    t = await createTestApp();
    const attempt = await startAttempt(t);
    await submit(t, attempt.id);
    const whilePending = await submit(t, attempt.id, { ...goodParkingDesign(), notes: 'changed' });
    expect(whilePending.statusCode).toBe(409);
    expect(whilePending.json().error.code).toBe('evaluation_in_progress');

    await t.container.worker.drain();
    const duplicate = await submit(t, attempt.id);
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().error.code).toBe('duplicate_submission');
  });

  it('refuses to compare submissions of different problems', async () => {
    t = await createTestApp();
    const a = (await submit(t, (await startAttempt(t)).id)).json();
    const b = (await submit(t, (await startAttempt(t, 'library-management')).id)).json();
    await t.container.worker.drain();
    const res = await t.app.inject({ url: `/api/compare?base=${a.id}&target=${b.id}`, headers: LEARNER });
    expect(res.statusCode).toBe(422);
  });

  it('falls back to a partial report when the AI is down, and upgrades it on retry', async () => {
    let healthy = false;
    t = await createTestApp({
      llm: fakeLlm({
        complete: async (request) => {
          if (!healthy) throw new LlmError('AI outage', true);
          return fakeLlm().complete(request);
        },
      }),
    });
    const attempt = await startAttempt(t);
    const sub = (await submit(t, attempt.id)).json();
    await t.container.worker.drain();

    const partial = await getSubmission(t, sub.id);
    expect(partial.status).toBe('evaluated_partial');
    expect(partial.evaluation?.completeness).toBe('partial');
    expect(partial.evaluation?.findings.length).toBeGreaterThan(0);

    healthy = true;
    const retry = await t.app.inject({ method: 'POST', url: `/api/submissions/${sub.id}/retry`, headers: LEARNER });
    expect(retry.statusCode).toBe(202);
    await t.container.worker.drain();
    const full = await getSubmission(t, sub.id);
    expect(full.status).toBe('evaluated');
    expect(full.evaluation?.completeness).toBe('complete');
  });

  it('cannot retry a submission that already has complete feedback', async () => {
    t = await createTestApp();
    const sub = (await submit(t, (await startAttempt(t)).id)).json();
    await t.container.worker.drain();
    const res = await t.app.inject({ method: 'POST', url: `/api/submissions/${sub.id}/retry`, headers: LEARNER });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('invalid_transition');
  });

  it('retries unexpected evaluation errors, then marks the submission failed', async () => {
    t = await createTestApp();
    const sub = (await submit(t, (await startAttempt(t)).id)).json();
    let calls = 0;
    t.container.pipeline.run = async () => {
      calls++;
      throw new Error('database hiccup');
    };
    await t.container.worker.drain();
    expect(calls).toBe(3); // maxAttempts
    const failed = await getSubmission(t, sub.id);
    expect(failed.status).toBe('failed');
    expect(failed.statusMessage).toMatch(/could not evaluate/);
  });

  it('recovers jobs abandoned by a crashed worker on restart', async () => {
    t = await createTestApp();
    const sub = (await submit(t, (await startAttempt(t)).id)).json();
    // A worker claims the job and "crashes" before finishing.
    const claimed = await t.container.queue.claimNext(t.clock.now());
    expect(claimed?.submissionId).toBe(sub.id);
    expect(await t.container.worker.drain()).toBe(0);

    t.clock.advance(10 * 60_000);
    await t.container.worker.start();
    await t.container.worker.stop();
    await t.container.worker.drain();
    expect((await getSubmission(t, sub.id)).status).toBe('evaluated');
  });
});
