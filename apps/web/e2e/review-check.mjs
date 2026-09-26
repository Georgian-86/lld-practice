// Checks that the analysis itself is sensible, not just that the UI works:
// submits a weak, a reasonable and an improved Parking Lot design through the
// API, prints each report, and fails if the scores are out of order, if the AI
// reviewer did not run, or if the AI cites classes that are not in the design.
//
//   BASE_URL=https://blueprint-lld.onrender.com EXPECT_REAL_AI=1 node e2e/review-check.mjs
import { randomUUID } from 'node:crypto';
import { parkingDesign } from './fixture-design.mjs';

const BASE = (process.env.BASE_URL ?? 'http://localhost:5173').replace(/\/$/, '');
const EXPECT_REAL_AI = process.env.EXPECT_REAL_AI === '1';
const learner = `review-check-${randomUUID().slice(0, 8)}`;

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-learner-id': learner },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(json)}`);
  return json;
}

function weakDesign() {
  const e = (id, name, responsibilities, methods = []) => ({ id, name, kind: 'class', responsibilities, methods, attributes: [] });
  return {
    format: 'structured',
    design: {
      entities: [
        e('w1', 'ParkingManager', ['Does everything'], ['park()', 'unpark()', 'computeFee()', 'findSpot()', 'printTicket()', 'takePayment()', 'updateDisplay()', 'openGate()']),
        e('w2', 'Car', ['A car']),
      ],
      relationships: [{ id: 'wr1', from: 'ParkingManager', to: 'Car', type: 'association' }],
      requirementMap: {},
      patterns: [],
      tradeOffs: [],
      extensionAnswer: '',
      notes: '',
    },
  };
}

async function evaluate(label, draft) {
  const attempt = await api('POST', '/api/attempts', { problemId: 'parking-lot' });
  let sub = await api('POST', `/api/attempts/${attempt.id}/submissions`, { draft });
  const deadline = Date.now() + 180_000;
  while (!['evaluated', 'evaluated_partial', 'failed'].includes(sub.status)) {
    if (Date.now() > deadline) throw new Error(`${label}: still ${sub.status} after 3 minutes`);
    await new Promise((r) => setTimeout(r, sub.pollAfterMs ?? 1500));
    sub = await api('GET', `/api/submissions/${sub.id}`);
  }
  if (!sub.evaluation) throw new Error(`${label}: ${sub.status} without a report (${sub.statusMessage})`);
  return { label, draft, report: sub.evaluation };
}

function print({ label, report }) {
  console.log(`\n━━ ${label}: ${report.overallScore}/100 (${report.grade}, ${report.completeness})`);
  console.log(`   ${report.summary}`);
  for (const run of report.evaluators) console.log(`   evaluator ${run.evaluatorId} [${run.kind}] ${run.status}${run.detail ? ` · ${run.detail}` : ''}${run.error ? ` · ${run.error}` : ''} · ${run.durationMs}ms`);
  for (const c of report.criterionScores) console.log(`   ${String(c.score).padStart(3)}  ${c.name} (rules ${c.ruleScore}, ai ${c.aiScore ?? '–'}, w ${c.weight})`);
  for (const f of report.findings) {
    const cited = f.evidence.entities?.length ? ` [${f.evidence.entities.join(', ')}]` : '';
    console.log(`   ${f.source === 'ai' ? 'AI  ' : 'rule'} ${f.kind.padEnd(10)} ${f.severity.padEnd(8)} ${f.title}${cited}`);
  }
  if (report.nextStep) console.log(`   next: ${report.nextStep}`);
}

const problems = [];
const check = (ok, message) => {
  console.log(`${ok ? '✓' : '✗'} ${message}`);
  if (!ok) problems.push(message);
};

console.log(`Review check against ${BASE}`);
const health = await api('GET', '/api/health');
console.log(`AI reviewer: ${health.aiReviewer}`);
if (EXPECT_REAL_AI) check(!/simulated|disabled/.test(health.aiReviewer), `a real AI reviewer is configured (${health.aiReviewer})`);

const results = [];
for (const [label, draft] of [
  ['weak (one god class)', weakDesign()],
  ['reasonable (e2e fixture v1)', parkingDesign()],
  ['improved (fixture v2)', parkingDesign({ improved: true })],
]) {
  const result = await evaluate(label, draft);
  print(result);
  results.push(result);
}

console.log('\nChecks');
const [weak, mid, strong] = results;
check(weak.report.overallScore < mid.report.overallScore, `weak (${weak.report.overallScore}) scores below reasonable (${mid.report.overallScore})`);
check(mid.report.overallScore <= strong.report.overallScore, `reasonable (${mid.report.overallScore}) scores no higher than improved (${strong.report.overallScore})`);
check(weak.report.grade === 'needs-work' || weak.report.overallScore < 50, `the weak design is graded needs-work (${weak.report.grade})`);
check(weak.report.findings.some((f) => f.kind === 'issue' && f.evidence.entities?.includes('ParkingManager')), 'the god class is called out by name');

for (const { label, draft, report } of results) {
  const llm = report.evaluators.find((r) => r.kind === 'llm');
  check(llm?.status === 'ok', `${label}: AI review ran (${llm ? `${llm.status}${llm.error ? `: ${llm.error}` : ''}` : 'no llm evaluator'})`);
  if (EXPECT_REAL_AI) check(llm?.detail !== 'simulated', `${label}: AI review came from the real model (${llm?.detail})`);
  const names = new Set(draft.design.entities.map((e) => e.name.toLowerCase()));
  const ai = report.findings.filter((f) => f.source === 'ai');
  check(ai.length > 0, `${label}: AI contributed ${ai.length} finding(s)`);
  const invented = ai.flatMap((f) => f.evidence.entities ?? []).filter((n) => !names.has(n.toLowerCase()));
  check(invented.length === 0, `${label}: AI only cites classes that exist${invented.length ? ` (invented: ${invented.join(', ')})` : ''}`);
  const fingerprints = report.findings.map((f) => f.fingerprint);
  check(new Set(fingerprints).size === fingerprints.length, `${label}: no duplicate findings`);
  check(report.criterionScores.every((c) => c.score >= 0 && c.score <= 100), `${label}: criterion scores are within 0–100`);
}

if (problems.length) {
  console.log(`\n✗ ${problems.length} check(s) failed`);
  process.exit(1);
}
console.log('\n✓ The analysis is consistent');
