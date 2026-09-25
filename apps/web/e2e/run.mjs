/**
 * End-to-end walkthrough in a real browser. Drives the full practice loop,
 * saves screenshots for design review, and FAILS on any console error,
 * uncaught page error or failed API request.
 *
 * Usage: BASE_URL=http://localhost:5173 node e2e/run.mjs
 */
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import { parkingDesign } from './fixture-design.mjs';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const OUT = new URL('./screenshots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const executablePath = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath });
const problems = [];

// Expected non-2xx responses the walkthrough provokes on purpose (browsers log these as console errors).
const EXPECTED_STATUS = /status of (404|409) /;

async function newPage(viewport = { width: 1440, height: 900 }, colorScheme = 'light', learnerId) {
  // ignoreHTTPSErrors: sandboxed environments may intercept Google Fonts with a private CA.
  const context = await browser.newContext({ viewport, colorScheme, deviceScaleFactor: 1, ignoreHTTPSErrors: true });
  if (learnerId) await context.addInitScript((id) => localStorage.setItem('blueprint.learnerId', id), learnerId);
  const page = await context.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !EXPECTED_STATUS.test(msg.text())) problems.push(`[console] ${page.url()} :: ${msg.text()}`);
  });
  page.on('pageerror', (err) => problems.push(`[pageerror] ${page.url()} :: ${err.message}`));
  page.on('response', (res) => {
    if (res.url().includes('/api/') && res.status() >= 500) problems.push(`[http ${res.status()}] ${res.url()}`);
  });
  page.on('requestfailed', (req) => {
    const text = req.failure()?.errorText ?? '';
    // A debounced autosave in flight when the test navigates is cancelled by the browser;
    // the pagehide flush re-sends it with keepalive, so nothing is lost.
    const benignAbort = text.includes('ERR_ABORTED') && (req.url().includes('fonts.g') || req.url().endsWith('/draft'));
    if (!benignAbort) problems.push(`[requestfailed] ${req.url()} ${text}`);
  });
  return page;
}

const shot = (page, name, fullPage = true) => page.screenshot({ path: `${OUT}${name}.png`, fullPage });

// Accessibility: run axe-core on a page and record serious/critical WCAG A/AA violations.
const axePath = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
async function audit(page, label) {
  await page.addScriptTag({ path: axePath });
  const violations = await page.evaluate(async () => {
    const result = await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa'] });
    return result.violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => `${v.id} (${v.impact}): ${v.help} → ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
  });
  for (const v of violations) problems.push(`[a11y] ${label}: ${v}`);
}
const step = (name) => console.log(`• ${name}`);

const page = await newPage();

step('Home');
await page.goto(BASE);
await page.getByRole('heading', { name: 'Problems' }).waitFor();
await page.getByText('Parking Lot').first().waitFor();
await shot(page, '01-home');
await audit(page, 'home');

step('Problem brief');
await page.getByRole('link', { name: /Parking Lot/ }).first().click();
await page.getByRole('button', { name: /Start attempt/ }).waitFor();
await shot(page, '02-problem');
await audit(page, 'problem');

step('Start attempt → empty workspace');
await page.getByRole('button', { name: /Start attempt/ }).click();
await page.getByText('Start with the nouns').waitFor();
await shot(page, '03-workspace-empty', false);

step('Build a little of the design through the UI');
await page.getByRole('button', { name: 'Add class' }).click();
await page.getByLabel('Name').fill('ParkingLot');
await page.getByLabel('Responsibilities').fill('Coordinates entry and exit');
await page.getByRole('button', { name: 'Add', exact: true }).click();
await page.getByLabel('Name').fill('Floor');
await page.getByLabel('Responsibilities').fill('Tracks free spots');
await page.getByRole('tab', { name: /Relationships/ }).click();
await page.getByRole('button', { name: 'Add relationship' }).click();
await page.getByLabel('Relationship type').selectOption('composition');
await page.getByRole('tab', { name: /Traceability/ }).click();
await page.getByRole('button', { name: 'Map class' }).first().click();
await page.getByRole('menuitemcheckbox', { name: 'Floor' }).click();
await page.keyboard.press('Escape');
// Wait for autosave to settle (debounce + request), not just for any "Saved" label.
await page.waitForTimeout(1200);
await page.waitForFunction(() => !/Unsaved changes|Saving…/.test(document.body.innerText), null, { timeout: 8000 });

step('Load a fuller design (as if the learner kept going) and reload');
const attemptId = page.url().split('/attempts/')[1].split('?')[0];
await page.evaluate(
  async ([id, draft]) => {
    const learner = localStorage.getItem('blueprint.learnerId');
    const res = await fetch(`/api/attempts/${id}/draft`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-learner-id': learner },
      body: JSON.stringify({ draft }),
    });
    if (!res.ok) throw new Error(`draft save failed ${res.status}`);
  },
  [attemptId, parkingDesign()],
);
await page.goto(`${BASE}/attempts/${attemptId}?tab=classes`);
await page.getByRole('button', { name: /ParkingSpot/ }).waitFor();
await page.getByRole('button', { name: /ParkingSpot/ }).click();
await page.waitForTimeout(250); // let the selection transition finish
await shot(page, '04-workspace-classes', false);
await audit(page, 'workspace classes');
for (const [tab, name] of [
  ['Relationships', '05-workspace-relationships'],
  ['Traceability', '06-workspace-traceability'],
  ['Patterns', '07-workspace-patterns'],
  ['Trade-offs', '08-workspace-reasoning'],
  ['Diagram', '09-workspace-diagram'],
]) {
  // (each tab is audited below)
  await page.getByRole('tab', { name: new RegExp(tab) }).click();
  if (tab === 'Diagram') await page.locator('svg[id^="mmd-"]').first().waitFor({ timeout: 15000 });
  await page.waitForTimeout(300);
  await shot(page, name, false);
  await audit(page, `workspace ${tab}`);
}
await page.getByRole('tab', { name: 'Hints' }).click();
await page.getByRole('button', { name: 'Reveal hint' }).click();
await page.getByText('List the nouns').waitFor();
await shot(page, '10-workspace-hints', false);

step('Submit v1');
await page.getByRole('button', { name: 'Submit for review' }).click();
await page.getByRole('dialog').waitFor();
await shot(page, '11-submit-dialog', false);
await audit(page, 'submit dialog');
await page.getByRole('dialog').getByRole('button', { name: 'Submit', exact: true }).click();
await page.getByText(/Reviewing version 1/).waitFor();
await shot(page, '12-evaluating', false);
await page.getByText('Rubric breakdown').waitFor({ timeout: 30000 });
await page.waitForTimeout(800);
await shot(page, '13-feedback-v1');
await audit(page, 'feedback');
const v1 = page.url().split('/submissions/')[1];

step('Deep link from a finding into the editor');
await page.getByRole('link', { name: 'FR-5' }).first().click();
await page.waitForURL(/tab=traceability&focus=FR-5/);
await page.locator('#req-FR-5.ring-4').waitFor();
await page.waitForTimeout(600);
await shot(page, '13b-deep-link', false);
await page.goBack();
await page.getByText('Rubric breakdown').waitFor();

step('Revise and submit v2');
await page.getByRole('button', { name: 'Revise design' }).click();
await page.getByRole('button', { name: 'Submit for review' }).waitFor();
await page.evaluate(
  async ([id, draft]) => {
    const learner = localStorage.getItem('blueprint.learnerId');
    await fetch(`/api/attempts/${id}/draft`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-learner-id': learner },
      body: JSON.stringify({ draft }),
    });
  },
  [attemptId, parkingDesign({ improved: true })],
);
await page.reload();
await page.getByRole('button', { name: /DisplayBoard/ }).waitFor();
await page.getByRole('button', { name: 'Submit for review' }).click();
await page.getByRole('dialog').getByRole('button', { name: 'Submit', exact: true }).click();
await page.getByText('Rubric breakdown').waitFor({ timeout: 30000 });
await page.waitForTimeout(800);
await shot(page, '14-feedback-v2');

step('Compare');
await page.getByRole('button', { name: /Compare with v1/ }).click();
await page.getByText('What changed between versions').waitFor();
await page.waitForTimeout(500);
await shot(page, '15-compare');
await audit(page, 'compare');

step('Progress');
await page.getByRole('link', { name: 'Progress' }).click();
await page.getByText('Score over time').waitFor();
await page.waitForTimeout(500);
await shot(page, '16-progress');
await audit(page, 'progress');

step('Duplicate submission is refused with a toast');
await page.goto(`${BASE}/attempts/${attemptId}`);
await page.getByRole('button', { name: 'Submit for review' }).click();
await page.getByRole('dialog').getByRole('button', { name: 'Submit', exact: true }).click();
await page.getByText('No changes to submit').waitFor();
await shot(page, '17-duplicate-toast', false);

step('404 page');
await page.goto(`${BASE}/submissions/sub_does_not_exist`);
await page.getByText('We couldn’t find that').waitFor();
await shot(page, '18-not-found', false);

step('Dark mode');
const learner = await page.evaluate(() => localStorage.getItem('blueprint.learnerId'));
const dark = await newPage({ width: 1440, height: 900 }, 'dark', learner);
await dark.goto(`${BASE}/submissions/${v1}`);
await dark.getByText('Rubric breakdown').waitFor();
await shot(dark, '19-dark-feedback');
await audit(dark, 'dark feedback');
await dark.goto(`${BASE}/attempts/${attemptId}?tab=classes`);
await dark.getByRole('button', { name: /ParkingLot/ }).first().waitFor();
await shot(dark, '20-dark-workspace', false);
await audit(dark, 'dark workspace');

step('Mobile');
const mobile = await newPage({ width: 390, height: 844 }, 'light', learner);
await mobile.goto(BASE);
await mobile.getByText('Parking Lot').first().waitFor();
await shot(mobile, '21-mobile-home');
await audit(mobile, 'mobile home');
await mobile.goto(`${BASE}/submissions/${v1}`);
await mobile.getByText('Rubric breakdown').waitFor();
await shot(mobile, '22-mobile-feedback');
for (const path of ['/', `/submissions/${v1}`, '/progress', `/attempts/${attemptId}`, '/problems/parking-lot']) {
  await mobile.goto(`${BASE}${path}`);
  await mobile.waitForLoadState('networkidle');
  const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 0) problems.push(`[layout] ${path} scrolls horizontally on mobile by ${overflow}px`);
}
await mobile.goto(`${BASE}/attempts/${attemptId}`);
await mobile.getByRole('button', { name: 'Brief & hints' }).click();
await mobile.getByRole('dialog').getByText('A city-centre garage').waitFor();
await mobile.waitForTimeout(400); // let the slide-in finish
await shot(mobile, '23-mobile-workspace-brief', false);

await browser.close();

if (problems.length) {
  console.error(`\n✗ ${problems.length} problem(s):\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  process.exit(1);
}
console.log(`\n✓ Walkthrough passed. Screenshots in ${OUT}`);
