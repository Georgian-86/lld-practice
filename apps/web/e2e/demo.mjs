/**
 * Records a narrated demo video of the full practice loop.
 * Usage: BASE_URL=http://localhost:3001 node e2e/demo.mjs  → e2e/demo/blueprint-demo.webm
 */
import { mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const OUT = new URL('./demo/', import.meta.url).pathname;
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? (existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined),
});
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  recordVideo: { dir: OUT, size: { width: 1280, height: 800 } },
  ignoreHTTPSErrors: true,
});

// On-screen caption bar injected into every page.
await context.addInitScript(() => {
  window.__caption = (text) => {
    let el = document.getElementById('__demo_caption');
    if (!el) {
      el = document.createElement('div');
      el.id = '__demo_caption';
      Object.assign(el.style, {
        position: 'fixed', left: '50%', bottom: '24px', transform: 'translateX(-50%)', zIndex: 2147483647,
        background: 'rgba(15,23,41,0.92)', color: '#fff', padding: '12px 20px', borderRadius: '12px',
        font: '500 16px/1.4 Inter Variable, Inter, system-ui, sans-serif', maxWidth: '900px', textAlign: 'center',
        boxShadow: '0 10px 30px rgba(0,0,0,.25)', pointerEvents: 'none', transition: 'opacity .2s',
      });
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.style.opacity = text ? '1' : '0';
  };
});

const page = await context.newPage();
const wait = (ms) => page.waitForTimeout(ms);
async function say(text, ms = 2600) {
  await page.evaluate((t) => window.__caption?.(t), text);
  await wait(ms);
}
/** Choose a class in an open "Map class" menu (item text is kind letter + name). */
const pick = (name) => page.getByRole('menuitemcheckbox').filter({ hasText: new RegExp(`^[CIAE]${name}$`) }).click();

async function scrollBy(y, steps = 8) {
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, y / steps);
    await wait(60);
  }
}

// 1. Catalogue
await page.goto(BASE);
await page.getByRole('heading', { name: 'Problems' }).waitFor();
await say('Blueprint — practise Low-Level Design and get feedback that explains itself.', 3500);
await scrollBy(420);
await say('Pick a problem. Each has clear requirements, likely points of change, and a rubric.', 3000);

// 2. Problem brief
await page.getByRole('link', { name: /Parking Lot/ }).first().click();
await page.getByRole('button', { name: /Start attempt/ }).waitFor();
await say('The brief: functional + non-functional requirements, and how this problem is scored.', 3500);
await page.getByRole('button', { name: /Start attempt/ }).click();
await page.getByText('Start with the nouns').waitFor();
await say('A new attempt opens the workspace. Work is autosaved.', 2500);

// 3. Build part of the design by hand
await page.getByRole('button', { name: 'Add class' }).click();
await page.getByLabel('Name').pressSequentially('ParkingLot', { delay: 45 });
await page.getByLabel('Responsibilities').pressSequentially('Entry point for park and unpark flows\nDelegates spot choice and pricing', { delay: 18 });
await page.getByLabel('Methods').pressSequentially('park(vehicle): Ticket\nunpark(ticket): Receipt', { delay: 18 });
await say('Classes are written with their responsibilities — the first thing reviewers look at.', 2500);

// 4. Import the rest from Mermaid
await page.getByRole('tab', { name: /Diagram/ }).click();
await say('Already sketched a diagram? Import Mermaid instead of retyping it.', 2200);
await page.getByRole('button', { name: 'Import Mermaid' }).click();
const mermaid = `classDiagram
  class ParkingLot {
    +park(vehicle) Ticket
    +unpark(ticket) Receipt
  }
  class Floor {
    +findFree(type) ParkingSpot
  }
  class ParkingSpot {
    <<abstract>>
    +canFit(vehicle) bool
  }
  class Vehicle {
    <<abstract>>
  }
  class PricingStrategy {
    <<interface>>
    +fee(ticket) Money
  }
  ParkingLot "1" *-- "many" Floor : has
  Floor *-- ParkingSpot
  CompactSpot --|> ParkingSpot
  LargeSpot --|> ParkingSpot
  Car --|> Vehicle
  Truck --|> Vehicle
  Ticket --> ParkingSpot
  EntryGate ..> ParkingLot
  HourlyPricing ..|> PricingStrategy
  ParkingLot --> PricingStrategy : prices with`;
await page.getByLabel('Mermaid source').fill(mermaid);
await say('It parses as you paste: classes, annotations, members and every arrow type.', 2600);
await page.getByRole('button', { name: /Replace classes/ }).click();
await page.locator('svg[id^="mmd-"]').first().waitFor({ timeout: 15000 });
await wait(800);
await say('The live class diagram is generated from the structured design.', 3000);

// Give the imported classes one-line responsibilities (fast-forward).
await page.getByRole('tab', { name: /^Classes/ }).click();
const jobs = {
  Floor: 'Holds spots and tracks free spots per type',
  ParkingSpot: 'Knows its size and whether it is free',
  CompactSpot: 'Fits motorcycles and cars',
  LargeSpot: 'Fits any vehicle',
  Vehicle: 'Has a plate and a size',
  Car: 'Regular vehicle',
  Truck: 'Large vehicle',
  Ticket: 'Records entry time and spot',
  EntryGate: 'Issues tickets; refuses entry when full',
  PricingStrategy: 'Computes the fee for a ticket',
  HourlyPricing: 'Charges per started hour',
};
await say('Fast-forward: a one-line responsibility for each class…', 1200);
for (const [name, job] of Object.entries(jobs)) {
  await page.locator('ul[aria-label="Classes"] button', { hasText: new RegExp(`^[CIAE]${name}$`) }).click();
  await page.getByLabel('Responsibilities').fill(job);
  await wait(120);
}

// 5. Traceability
await page.getByRole('tab', { name: /Traceability/ }).click();
await say('Traceability: which class owns each requirement? This is what makes feedback checkable.', 2800);
const map = [
  ['FR-1', ['Floor', 'ParkingSpot']],
  ['FR-2', ['Vehicle']],
  ['FR-3', ['EntryGate', 'Ticket']],
  ['FR-4', ['PricingStrategy']],
];
for (const [req, names] of map) {
  const row = page.locator(`#req-${req}`);
  await row.getByRole('button', { name: 'Map class' }).click();
  for (const n of names) {
    await pick(n);
    await wait(150);
  }
  await page.keyboard.press('Escape');
  await wait(250);
}

// 6. Reasoning
await page.getByRole('tab', { name: /Trade-offs/ }).click();
await page.getByLabel('Trade-off 1', { exact: true }).pressSequentially('I chose a pricing strategy over an enum because tariffs change often, at the cost of more classes.', { delay: 12 });
await page.getByLabel('Your answer').pressSequentially('Add an EvSpot extending ParkingSpot and an EvPricing implementing PricingStrategy.', { delay: 12 });
await say('Trade-offs and the “what if” extension question — how interviewers test extensibility.', 2800);

// 7. Submit
await page.getByRole('button', { name: /Submit/ }).first().click();
await page.getByRole('dialog').waitFor();
await say('Before submitting: a readiness checklist. Gaps are allowed — the feedback will cover them.', 3200);
await page.getByRole('dialog').getByRole('button', { name: 'Submit', exact: true }).click();
await page.getByText(/Reviewing version 1/).waitFor();
await say('Evaluation runs in the background: design rules first, then the AI reviewer grounded on them.', 2000);
await page.getByText('Rubric breakdown').waitFor({ timeout: 30000 });
await wait(600);
await say('Feedback: a weighted rubric score. Each row shows the rule-check score and the AI score behind it.', 4200);
await scrollBy(560, 10);
await say('Findings are prioritised and tagged Rule or AI — and they point at your own classes and requirements.', 4200);
await scrollBy(700, 12);
await say('“Other valid approaches”: LLD has more than one right answer, so feedback says when an alternative is better.', 4000);
await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
await wait(700);

// 8. Deep link and fix
await say('Click a requirement on a finding to jump straight to where it can be fixed.', 2400);
await page.getByRole('link', { name: 'FR-5' }).first().click();
await page.waitForURL(/focus=FR-5/);
await wait(900);
const add = async (req, name) => {
  await page.locator(`#req-${req}`).getByRole('button', { name: 'Map class' }).click();
  await pick(name);
  await page.keyboard.press('Escape');
  await wait(200);
};
await page.getByRole('tab', { name: /^Classes/ }).click();
await page.getByRole('button', { name: 'Add', exact: true }).click();
await page.getByLabel('Name').pressSequentially('DisplayBoard', { delay: 40 });
await page.getByLabel('Responsibilities').fill('Shows free spot counts per type on each floor');
await page.getByRole('button', { name: 'Add', exact: true }).click();
await page.getByRole('radio', { name: 'Interface' }).click();
await page.getByLabel('Name').pressSequentially('SpotAllocationStrategy', { delay: 30 });
await page.getByLabel('Responsibilities').fill('Chooses a free spot for a vehicle; locks per floor');
await page.getByLabel('Methods').fill('allocate(vehicle, floors): ParkingSpot');
await say('Revise: add a DisplayBoard and a SpotAllocationStrategy seam…', 2200);
await page.getByRole('tab', { name: /Traceability/ }).click();
await add('FR-5', 'DisplayBoard');
await add('FR-6', 'EntryGate');
await add('NFR-1', 'SpotAllocationStrategy');
await page.getByRole('tab', { name: /Relationships/ }).click();
for (const [from, type, to] of [
  ['Floor', 'composition', 'DisplayBoard'],
  ['ParkingLot', 'association', 'SpotAllocationStrategy'],
]) {
  await page.getByRole('button', { name: 'Add relationship' }).last().click();
  const row = page.locator('ul > li').last();
  await row.getByLabel('From').selectOption(from);
  await row.getByLabel('Relationship type').selectOption(type);
  await row.getByLabel('To').selectOption(to);
  await wait(200);
}
await say('…map the missing requirements, connect the new classes, and resubmit.', 2200);

// 9. Resubmit → since last version → compare → progress
await page.keyboard.press('Control+Enter');
await page.getByRole('dialog').waitFor();
await wait(500);
await page.keyboard.press('Control+Enter');
await page.getByText('Rubric breakdown').waitFor({ timeout: 30000 });
await wait(700);
await say('Version 2: the report shows what improved since version 1.', 3800);
await page.getByRole('button', { name: /Compare with v1/ }).click();
await page.getByText('What changed between versions').waitFor();
await wait(600);
await say('Compare any two versions: fixed, still open, new strengths and new issues.', 3800);
await scrollBy(500, 8);
await wait(800);
await page.getByRole('link', { name: 'Progress' }).click();
await page.getByText('Score over time').waitFor();
await say('Progress over time, the weakest criterion, and what to practise next.', 4000);

// 10. Dark mode
await page.getByRole('button', { name: 'Toggle theme' }).click();
await say('Light and dark themes, accessible (WCAG AA checked), keyboard shortcuts, works on mobile.', 3500);
await say('', 400);

await context.close();
await browser.close();
const file = readdirSync(OUT).find((f) => f.endsWith('.webm'));
renameSync(`${OUT}${file}`, `${OUT}blueprint-demo.webm`);
console.log(`Demo video: ${OUT}blueprint-demo.webm`);
