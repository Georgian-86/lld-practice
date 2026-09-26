/**
 * End-to-end walkthrough in a real browser. Drives the full practice loop,
 * saves screenshots for design review, and FAILS on any console error,
 * uncaught page error or failed API request.
 *
 * Usage: BASE_URL=http://localhost:5173 node e2e/run.mjs
 */
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { parkingDesign } from './fixture-design.mjs';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const OUT = new URL('./screenshots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

// Local sandbox ships Chromium at a fixed path; elsewhere (e.g. CI) use Playwright's own browser.
const SANDBOX_CHROMIUM = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const executablePath = process.env.CHROMIUM_PATH ?? (existsSync(SANDBOX_CHROMIUM) ? SANDBOX_CHROMIUM : undefined);
const browser = await chromium.launch({ executablePath });
const problems = [];
const pages = [];

// On any failure, leave evidence behind: a screenshot of every open page (CI uploads the folder).
async function saveFailureEvidence(error) {
  console.error(error);
  for (const [i, p] of pages.entries()) {
    await p.screenshot({ path: new URL(`./screenshots/failure-${i}.png`, import.meta.url).pathname, fullPage: false }).catch(() => {});
  }
  if (problems.length) console.error(problems.join('\n'));
  await browser.close().catch(() => {});
  process.exit(1);
}
process.on('uncaughtException', saveFailureEvidence);
process.on('unhandledRejection', saveFailureEvidence);

// Expected non-2xx responses the walkthrough provokes on purpose (browsers log these as console errors).
const EXPECTED_STATUS = /status of (404|409) /;

async function newPage(viewport = { width: 1440, height: 900 }, colorScheme = 'light', learnerId) {
  // ignoreHTTPSErrors: sandboxed environments may intercept Google Fonts with a private CA.
  const context = await browser.newContext({ viewport, colorScheme, deviceScaleFactor: 1, ignoreHTTPSErrors: true });
  if (learnerId) await context.addInitScript((id) => localStorage.setItem('blueprint.learnerId', id), learnerId);
  const page = await context.newPage();
  pages.push(page);
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !EXPECTED_STATUS.test(msg.text())) problems.push(`[console] ${page.url()} :: ${msg.text()}`);
    // React Flow reports broken edges/handles as warnings ("[React Flow]: …"); treat those as bugs too.
    if (msg.type() === 'warning' && msg.text().includes('React Flow')) problems.push(`[react-flow] ${page.url()} :: ${msg.text()}`);
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
  // Measure toasts at rest: mid fade-in, their colours are blends that no one reads.
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || !(a.effect?.target instanceof Element) || !a.effect.target.closest('[data-sonner-toast]')), null, { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(450); // sonner enters with a CSS transition, not an animation
  // Wait for every toast to finish fading (in or out): axe measures blended colours mid-fade.
  await page
    .waitForFunction(() => [...document.querySelectorAll('[data-sonner-toast]')].every((t) => ['0', '1'].includes(getComputedStyle(t).opacity)), null, { timeout: 6000 })
    .catch(() => {});
  await page.addScriptTag({ path: axePath });
  const violations = await page.evaluate(async () => {
    // Toasts that are leaving, or stacked behind the front one, are mid-fade and covered: not something anyone reads.
    for (const t of document.querySelectorAll('[data-sonner-toast]')) if (getComputedStyle(t).opacity !== '1') t.setAttribute('data-audit-fading', '');
    const context = {
      include: [document],
      exclude: [['[data-sonner-toast][data-removed="true"]'], ['[data-sonner-toast][data-front="false"]'], ['[data-audit-fading]']],
    };
    const toasts = [...document.querySelectorAll('[data-sonner-toast]:not([data-audit-fading])')].map((t) => t.textContent?.trim()).filter(Boolean);
    const result = await window.axe.run(context, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa'] });
    return result.violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => `${v.id} (${v.impact}): ${v.help} → ${v.nodes.slice(0, 3).map((n) => `${n.target.join(' ')}${n.any?.[0]?.message ? ` (${n.any[0].message})` : ''}`).join(' | ')}${toasts.length ? ` [toasts on screen: ${toasts.join(' / ')}]` : ''}`);
  });
  for (const v of violations) problems.push(`[a11y] ${label}: ${v}`);
}
const step = (name) => console.log(`• ${name}`);

const page = await newPage();

step('Home');
await page.goto(BASE);
await page.getByRole('heading', { name: 'Problems' }).waitFor();
await page.getByRole('heading', { name: 'Parking Lot', exact: true }).waitFor();
await page.waitForTimeout(1600); // let the hero diagram finish assembling
await shot(page, '01-home');
await audit(page, 'home');

step('Problem brief');
await page.getByRole('link', { name: /Parking Lot/ }).first().click();
await page.getByRole('button', { name: /Start attempt/ }).waitFor();
await shot(page, '02-problem');
await audit(page, 'problem');

step('Start attempt → empty workspace');
await page.getByRole('button', { name: /Start attempt/ }).click();
await page.getByText('Start drawing your design').waitFor();
await shot(page, '03-workspace-empty', false);
await audit(page, 'empty canvas');

step('Draw on the canvas: add classes, connect them, drop a requirement');
await page.getByTitle('Add class').click();
await page.getByLabel('Name').fill('ParkingLot');
await page.getByLabel('Responsibilities').fill('Coordinates entry and exit');
await page.getByTitle('Add class').click();
await page.getByLabel('Name').fill('Floor');
await page.getByLabel('Responsibilities').fill('Tracks free spots');
const canvasNode = (name) => page.locator('.react-flow__node', { hasText: name }).first();
await page.getByRole('button', { name: 'Relationship type for new connections' }).click();
await page.getByRole('menuitemradio', { name: /owns/ }).click();
// Measure only once the element has stopped moving (new nodes are placed, then measured by React Flow).
async function stableBox(locator) {
  let previous = null;
  for (let i = 0; i < 20; i++) {
    const box = await locator.boundingBox();
    if (box && previous && Math.abs(box.x - previous.x) < 0.5 && Math.abs(box.y - previous.y) < 0.5) return box;
    previous = box;
    await page.waitForTimeout(100);
  }
  return previous;
}
async function dragConnect(fromName, toName) {
  // Use the handles that face each other, as a person would: new classes can land on
  // either side (placement depends on measured sizes), and dragging across the source's
  // own body to the far handle proved unreliable in CI's headless Chrome.
  const fromBox = await stableBox(canvasNode(fromName));
  const toBox = await stableBox(canvasNode(toName));
  const dx = toBox.x + toBox.width / 2 - (fromBox.x + fromBox.width / 2);
  const dy = toBox.y + toBox.height / 2 - (fromBox.y + fromBox.height / 2);
  const [fromSide, toSide] =
    Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? ['right', 'left'] : ['left', 'right']) : dy >= 0 ? ['bottom', 'top'] : ['top', 'bottom'];
  const source = canvasNode(fromName).locator(`.react-flow__handle-${fromSide}`);
  const target = canvasNode(toName).locator(`.react-flow__handle-${toSide}`);
  await canvasNode(fromName).hover();
  const a = await stableBox(source);
  const b = await stableBox(target);
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 10 });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 10 });
  await page.waitForTimeout(100); // let React Flow register the handle under the pointer
  await page.mouse.up();
  return { a, b, sides: `${fromSide}→${toSide}` };
}
{
  let attempt = await dragConnect('ParkingLot', 'Floor');
  const connected = () => page.locator('.react-flow__edge').first().waitFor({ timeout: 4000 }).then(() => true, () => false);
  if (!(await connected())) {
    console.log(`  (connect gesture missed: from ${JSON.stringify(attempt.a)} to ${JSON.stringify(attempt.b)}; measuring again)`);
    attempt = await dragConnect('ParkingLot', 'Floor');
    if (!(await connected())) throw new Error(`Dragging between handles did not create a relationship (from ${JSON.stringify(attempt.a)} to ${JSON.stringify(attempt.b)})`);
  }
}
await page.getByTitle(/^FR-1:/).dragTo(canvasNode('Floor'));
await canvasNode('Floor').getByText('FR-1').waitFor();

step('Undo and redo on the canvas');
await page.locator('.react-flow__pane').click({ position: { x: 20, y: 20 } });
await page.keyboard.press('Control+z');
await canvasNode('Floor').getByText('FR-1').waitFor({ state: 'detached' });
await page.keyboard.press('Control+Shift+z');
await canvasNode('Floor').getByText('FR-1').waitFor();
await page.getByRole('button', { name: 'Undo' }).click();
await canvasNode('Floor').getByText('FR-1').waitFor({ state: 'detached' });
await page.getByRole('button', { name: 'Redo' }).click();
await canvasNode('Floor').getByText('FR-1').waitFor();
await page.getByRole('tab', { name: /Class list/ }).click();
await page.getByRole('button', { name: 'Add', exact: true }).waitFor();
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
  ['Mermaid', '09-workspace-diagram'],
]) {
  // (each tab is audited below)
  await page.getByRole('tab', { name: new RegExp(tab) }).click();
  if (tab === 'Mermaid') await page.locator('svg[id^="mmd-"]').first().waitFor({ timeout: 15000 });
  await page.waitForTimeout(300);
  await shot(page, name, false);
  await audit(page, `workspace ${tab}`);
}
await page.getByRole('tab', { name: 'Hints' }).click();
await page.getByRole('button', { name: 'Reveal hint' }).click();
await page.getByText('List the nouns').waitFor();
await shot(page, '10-workspace-hints', false);
await page.getByRole('tab', { name: /^Diagram/ }).click();
await page.locator('.react-flow__node').nth(10).waitFor();
await page.getByTitle('Arrange automatically').click();
await page.waitForTimeout(1200);
await shot(page, '10b-canvas-full', false);
await audit(page, 'canvas with design');

step('Scenario walkthrough: click classes in call order');
const exactNode = (name) => page.locator('.react-flow__node').filter({ has: page.getByText(name, { exact: true }) }).first();
await page.getByRole('button', { name: /Scenarios/ }).click();
await page.getByLabel('Walk through a requirement').selectOption('FR-3');
for (const name of ['EntryGate', 'ParkingLot', 'Floor']) {
  await exactNode(name).getByText(name, { exact: true }).click();
  await page.waitForTimeout(150);
}
await page.getByText('Every call is backed by your diagram').waitFor();
if ((await page.getByTestId('call-label').count()) !== 2) throw new Error('expected 2 numbered calls on the canvas');
await page.getByTestId('sequence-diagram').locator('svg[id^="mmd-"]').waitFor({ timeout: 15000 });
// A call the diagram cannot support is flagged.
await exactNode('Ticket').getByText('Ticket', { exact: true }).click();
await page.getByText('Floor has no relationship to Ticket, so it cannot call it.').waitFor();
await page.waitForTimeout(400);
await shot(page, '10c-scenario', false);
await audit(page, 'scenario mode');
await page.getByRole('button', { name: 'Remove last call' }).click();
await page.getByText('Every call is backed by your diagram').waitFor();
await page.getByRole('button', { name: 'Leave scenario mode' }).click();
await page.waitForTimeout(1200);
await page.waitForFunction(() => !/Unsaved changes|Saving…/.test(document.body.innerText), null, { timeout: 8000 });

step('Submit v1');
await page.getByRole('button', { name: 'Submit for review' }).click();
await page.getByRole('dialog').waitFor();
await page.waitForTimeout(300);
{
  // Regression: dialogs must stay centred after their entry animation ends.
  const box = await page.getByRole('dialog').boundingBox();
  const vp = page.viewportSize();
  const dx = Math.abs(box.x + box.width / 2 - vp.width / 2);
  const dy = Math.abs(box.y + box.height / 2 - vp.height / 2);
  if (dx > 2 || dy > 2) problems.push(`[layout] submit dialog is off-centre by (${dx.toFixed(0)}, ${dy.toFixed(0)})px`);
}
await shot(page, '11-submit-dialog', false);
await audit(page, 'submit dialog');
await page.getByRole('dialog').getByRole('button', { name: 'Submit', exact: true }).click();
await page.getByText(/Reviewing version 1/).waitFor();
await shot(page, '12-evaluating', false);
await page.getByText('Rubric breakdown').waitFor({ timeout: 30000 });
await page.getByText('Achievement unlocked: First blueprint').waitFor({ timeout: 8000 });
await page.waitForTimeout(800);
await page.getByText('Your diagram', { exact: true }).scrollIntoViewIfNeeded();
await page.locator('.react-flow__node').first().waitFor();
await page.locator('.react-flow__edge').first().waitFor({ timeout: 5000 }); // the annotated diagram must draw relationships
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

step('Pick a curveball from the deck and submit v2');
await page.getByText('The interviewer’s curveballs').scrollIntoViewIfNeeded();
await page.getByRole('radio', { name: /Pay by UPI or wallet/ }).click();
await shot(page, '13a-curveball-deck', false);
await page.getByRole('button', { name: 'Take this curveball' }).click();
await page.getByRole('button', { name: 'Submit for review' }).waitFor();
await page.getByRole('status').filter({ hasText: 'Pay by UPI or wallet' }).waitFor();
await page.waitForTimeout(1200);
await page.waitForFunction(() => !/Unsaved changes|Saving…/.test(document.body.innerText), null, { timeout: 8000 });
await page.evaluate(
  async ([id, draft]) => {
    const learner = localStorage.getItem('blueprint.learnerId');
    await fetch(`/api/attempts/${id}/draft`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-learner-id': learner },
      body: JSON.stringify({ draft }),
    });
  },
  [attemptId, { ...parkingDesign({ improved: true }), challenge: { kind: 'curveball', fromVersion: 1, curveballId: 'upi-wallet', acceptedAt: new Date().toISOString() } }],
);
await page.reload();
await page.locator('.react-flow__node', { hasText: 'DisplayBoard' }).waitFor();
// Live blast radius: the banner counts, and new classes are tagged on the canvas.
await page.getByRole('status').filter({ hasText: 'vs v1' }).waitFor();
await page.locator('.react-flow__node').getByText('new', { exact: true }).first().waitFor();
await page.waitForTimeout(400);
await shot(page, '13c-curveball-workspace', false);
await audit(page, 'curveball workspace');
await page.getByRole('button', { name: 'Submit for review' }).click();
await page.getByRole('dialog').getByRole('button', { name: 'Submit', exact: true }).click();
await page.getByText('Rubric breakdown').waitFor({ timeout: 30000 });
await page.getByText(/Curveball result · Pay by UPI or wallet/).waitFor();
// The deck is offered again, with the played curveball marked.
await page.getByRole('radio', { name: /Pay by UPI or wallet.*Played/ }).waitFor();
await page.getByText('Change since version 1').waitFor(); // the diagram opens on the impact view
await page.waitForTimeout(1000);
await shot(page, '14-feedback-v2');
await audit(page, 'feedback v2 (curveball)');
await page.getByRole('button', { name: /Walkthroughs/ }).click();
await page.getByTestId('call-label').first().waitFor();
await page.waitForTimeout(400);
await page.getByText('Your diagram', { exact: true }).scrollIntoViewIfNeeded();
await shot(page, '14b-feedback-walkthrough', false);

step('Aim a curveball at the design');
await page.getByRole('button', { name: /Aim one at my design/ }).click();
await page.getByRole('radio', { name: /Aimed at/ }).waitFor();
await page.getByRole('radio', { name: /Aimed at/ }).scrollIntoViewIfNeeded();
await page.waitForTimeout(300);
await shot(page, '14c-adaptive-curveball', false);
await audit(page, 'adaptive curveball');
await page.getByRole('button', { name: 'Take this curveball' }).click();
// The title is the template's offline, or the model's wording when a real AI reviewer is configured.
await page.getByRole('status').filter({ hasText: /Curveball: \S/ }).waitFor();
await page.goBack();
await page.getByText('Rubric breakdown').waitFor();

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
await page.getByText('Achievements', { exact: true }).scrollIntoViewIfNeeded();
await page.getByLabel('Walked it through: earned').waitFor();
await page.getByLabel('Iterator: earned').waitFor();
await shot(page, '16-progress');
await audit(page, 'progress');

step('Timed interview');
await page.goto(`${BASE}/problems/library-management`);
await page.getByRole('button', { name: 'Timed interview' }).click();
await page.getByRole('timer').waitFor();
if (!/left in the interview/.test((await page.getByRole('timer').getAttribute('aria-label')) ?? '')) throw new Error('timer should be counting down');
await page.waitForTimeout(400);
await shot(page, '16b-timed-workspace', false);
await audit(page, 'timed workspace');
await page.getByRole('button', { name: 'Stop the interview timer' }).click();
await page.getByRole('timer').waitFor({ state: 'detached' });

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

step('See a sample report from the home page');
await page.goto(BASE);
await page.getByRole('button', { name: 'See a sample report' }).click();
await page.waitForURL(/\/submissions\//);
await page.getByText('Rubric breakdown').waitFor({ timeout: 30000 });
await page.getByRole('button', { name: /Walkthroughs/ }).waitFor(); // the sample includes a scenario walkthrough
await page.waitForTimeout(800);
await shot(page, '18b-sample-report', false);
await audit(page, 'sample report');

step('Dark mode');
const learner = await page.evaluate(() => localStorage.getItem('blueprint.learnerId'));
const dark = await newPage({ width: 1440, height: 900 }, 'dark', learner);
await dark.goto(`${BASE}/submissions/${v1}`);
await dark.getByText('Rubric breakdown').waitFor();
await shot(dark, '19-dark-feedback');
await audit(dark, 'dark feedback');
await dark.goto(`${BASE}/attempts/${attemptId}`);
await dark.locator('.react-flow__node').first().waitFor();
await dark.waitForTimeout(800);
await shot(dark, '20b-dark-canvas', false);
await audit(dark, 'dark canvas');
await dark.goto(`${BASE}/attempts/${attemptId}?tab=classes`);
await dark.getByRole('button', { name: /ParkingLot/ }).first().waitFor();
await shot(dark, '20-dark-workspace', false);
await audit(dark, 'dark workspace');

step('Mobile');
const mobile = await newPage({ width: 390, height: 844 }, 'light', learner);
await mobile.goto(BASE);
await mobile.getByRole('heading', { name: 'Parking Lot', exact: true }).waitFor();
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
