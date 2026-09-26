# Iteration log

Each iteration ends with a critique of what was built (from screenshots of a real
browser run, `npm run e2e`) and a backlog. The next iteration starts by burning
down that backlog.

---

## Iteration 1: end-to-end practice loop

**Built:** domain model and lifecycle, 15 deterministic rules, grounded AI reviewer
plus offline simulator, durable job queue and worker, REST API, and a web app with
catalogue, problem brief, workspace (6 editor tabs), submit checklist, live
evaluation progress, feedback report, version compare and progress dashboard.
Includes 93 unit and integration tests, and a Playwright walkthrough (13 steps,
dark mode, mobile).

### Critique

**Bugs (seen in screenshots)**
1. The Mermaid diagram renders `park(vehicle): Ticket` as `park(vehicle) : : Ticket`: Mermaid expects `method() Type`, not a colon.
2. The mobile header overflows the viewport by 20px, so every page scrolls sideways on phones.
3. Rubric rationales lowercase identifiers (`held back mainly by: fr-5 has no owner`).
4. The simulated reviewer calls **ParkingSpot** "the coordinator" because it counts inheritance edges *into* a class. The feedback is wrong, and it produces a fake "new issue" on the compare page.
5. The simulated reviewer can award **100/100**, which is not credible for an offline heuristic.
6. The evaluation stepper shows "Design checks" as running while the job is still queued.

**UX gaps**
7. Findings are not actionable from the report: `FR-5` or `ParkingSpot` evidence chips don't take you to the place to fix them.
8. On phones and tablets the workspace hides the problem brief and requirements entirely (the sidebar is `lg+` only).
9. The report doesn't say what improved since the previous version. The learner has to open Compare to find out.
10. The Progress trend card leaves ~40% dead whitespace, and one line mixes all problems.
11. Compare's "Fixed" list includes optional *info* notes, which is noise.
12. The diagram uses Mermaid's grey default theme, which clashes with the product and is unreadable in places in dark mode.
13. The home page doesn't offer "continue where you left off" to returning learners.
14. There are no keyboard affordances (e.g. <kbd>Ctrl/⌘ Enter</kbd> to submit).
15. Attribute and method placeholders look like real content.

**Engineering**
16. No production build or single-process serve has been verified, and there is no deployment config.
17. No README, design note, research note or AI_USAGE yet.

### Backlog → Iteration 2
Fix 1–6. Implement 7 (deep links from findings into the editor), 8 (brief drawer on
small screens), 9 ("since last version" strip on the report), 10, 11, 12 (branded
diagram theme), 13 (continue card), 14 and 15. Then 16 and 17.

---

## Iteration 2: burn down the iteration 1 backlog

**Done:**
- Bugs 1–6 are fixed: Mermaid return types, mobile header, identifier casing,
  orchestrator heuristic (counts outgoing use and ownership edges, not
  inheritance), simulator ceiling (base 4/5), and the queued stepper state.
- **Deep links:** evidence chips on findings (`FR-5`, `ParkingSpot`) open the
  editor on the right tab and highlight the item.
- **Brief & hints drawer** on small screens. Compact toolbar on phones.
- **"What you did well" and "Since version N"** (score delta, fixed, new
  strengths, new issues) on the report.
- Progress: a problem filter on the trend, and cards no longer stretch.
- Compare ignores optional info notes.
- Branded Mermaid theme derived from design tokens (works in dark mode).
- "Continue where you left off" card on the home page.
- <kbd>Ctrl/⌘ S</kbd> saves and <kbd>Ctrl/⌘ Enter</kbd> submits.
- Clearer placeholders.
- Self-hosted fonts (no third-party requests), route-level code splitting, and
  `prefers-reduced-motion` support.
- Production build verified: one process serves the API, the web app and the
  worker, and the e2e passes against it. Dockerfile and `render.yaml` added
  (runtime layout verified without a Docker daemon).
- README, research note, design note and AI_USAGE written. Tests: 102
  (shared 16, API 81, web reducer 5).

### Critique
1. Rubric rows show a score (e.g. 88) with a rationale that reads as perfect
   ("Every functional requirement has an owner"). The rule-vs-AI split that
   explains the gap is hidden in a tooltip.
2. Progress shows *where* you are weak but not *what to practise next*.
3. No automated accessibility audit. Colour contrast and ARIA are only checked by eye.
4. The offline reviewer's alternatives are repetitive ("A simple enum for …"
   twice). This is acceptable for a labelled simulator; real Claude output varies.
5. Polling every second while evaluating is fine at this scale. SSE would be the
   next step (documented in the design note, not needed for the MVP).

### Backlog → Iteration 3
Show the rule/AI split inline (1). Recommend the next problem from the weakest
criterion (2). Add an axe-core audit to the e2e run and fix what it finds (3).

---

## Iteration 3: explainability and accessibility

**Done:**
- The rubric rows show *why* a score isn't 100: `20% weight · Checks 53 · AI 40 → 45`.
- Progress recommends **what to practise next**: the unpractised problem whose
  rubric weights the learner's weakest criterion most.
- **Automated accessibility audit** (axe-core, WCAG 2.1 A/AA) on 13 screens in the
  e2e run. It found 15 serious or critical issues, and all of them are fixed:
  - text contrast: `subtle`, `success`, `warning` and `info` tokens re-chosen from
    computed ratios (≥ 4.5:1 on every surface, both themes);
  - a separate `primary-solid` token for filled buttons, so dark mode passes both
    for "white on primary" and for "primary as text";
  - meters now have accessible names;
  - the findings filter is now a proper toggle group (Radix Tabs without panels
    left dangling `aria-controls`);
  - the diagram scroll region is keyboard-focusable;
  - the chart no longer nests interactive marks inside `role="img"`.
- The e2e walkthrough now fails on any serious or critical a11y violation, as well
  as on console errors, 5xx responses and horizontal overflow.

### Remaining known limitations
Documented in the README: anonymous per-browser identity, a single SQLite node,
heuristic offline reviewer quality, four problems, and an editor designed for desktop.

---

## Iteration 4: a real diagramming workspace, and a real model

**Feedback from the user:** the workspace felt like filling in a questionnaire;
it should be a real design tool, distinct from what already exists. A Groq key
was provided for real AI review.

**Done:**
- **UML canvas as the primary workspace** (React Flow + dagre):
  - class boxes with a stereotype, attributes and methods;
  - drag from a class's edge to another class to create a relationship, typed
    by a "Connect as" picker;
  - correct UML notation: hollow triangle for extends/implements (dashed for
    implements), filled or hollow diamond for owns/has, and open arrow for
    uses/depends (dashed for depends);
  - floating edges that fan out when parallel;
  - auto-layout with parents above children and wholes above parts, and new
    classes placed in the nearest free spot;
  - zoom, minimap, and <kbd>Delete</kbd> to remove.
- **Requirements as draggable chips:** drop `FR-3` onto the class that owns it,
  or select a class and click the chip (the keyboard-accessible path).
  Classes show the requirement tags they own.
- **Live design checks while drawing:** a new `/api/lint` endpoint runs the same
  15 rules that score submissions, in milliseconds, with no AI and nothing
  stored. Classes get issue badges, and the inspector lists issues (click one to
  jump to its class).
- **Inspector:** edit the selected class (name, kind, responsibilities, members,
  requirements it owns) or relationship (direction, type, label, multiplicity).
- **Annotated diagram on the feedback report:** the submitted diagram is shown
  read-only, with findings badged on the classes they concern.
- Deep links from findings now open the canvas with the class selected and
  centred.
- **Groq provider** (`GROQ_API_KEY`, OpenAI-compatible JSON mode) behind the same
  `LlmClient` port, so the timeout, retry and cache decorators and the output
  guardrails apply unchanged. Unit-tested against mocked HTTP.
- The e2e run now draws on the canvas (adds classes, connects them, drops a
  requirement), asserts the annotated diagram draws its edges, and fails on
  React Flow warnings. The a11y audit covers the canvas in both themes.

### Critique / backlog
1. The Groq integration could not be exercised live from this environment:
   outbound access to `api.groq.com` is blocked by the network policy.
   It is verified with mocked responses only.
2. Canvas editing is desktop-first. On phones it is view-and-select only; the
   inspector is hidden below `md`.
3. No undo/redo on the canvas yet. It would be cheap to add over the reducer
   (a history stack of drafts).

---

## Iteration 5: scenarios (how the design works) and undo/redo

**Why:** a class diagram shows *what* exists but not *how it works*. In an
interview the next question is always "walk me through parking a car". Nothing
in the platform could check that answer.

**Done:**
- **Scenario walkthroughs** (`flows` in the design IR): for a requirement, an
  ordered list of calls `A → B: message`.
  - **Scenario mode on the canvas:** pick a requirement, then click classes in
    call order. Each call is drawn over the dimmed class diagram as a numbered
    arrow: violet when valid, red and dashed when not. The suggested message is
    the callee's first method.
  - **Checked live** by `analyseFlow` (in `packages/shared`, so the canvas and
    the server agree). A call is valid when the caller holds a relationship to
    the callee, to one of its interfaces or ancestors (polymorphism), or to a
    subtype, or inherits one. The message must be a method the callee (or an
    ancestor) declares, when it declares any. A call from a class that nobody
    called yet is a break in the chain.
  - The side panel lists the calls with editable messages, explains each
    problem in plain words, lets the learner continue from any earlier class,
    and renders a **Mermaid sequence diagram** of the walkthrough.
  - **`ScenarioRule`** (rule 16) scores walkthroughs on submission: major
    for an impossible call, minor for an undeclared method or a broken chain,
    and a strength for a valid end-to-end walkthrough of three or more calls.
    Without walkthroughs it only suggests adding one, and does not deduct.
  - The AI reviewer's prompt includes the walkthroughs, so it can comment on
    them.
- **Undo/redo** for every design edit (toolbar buttons, <kbd>Ctrl</kbd>+<kbd>Z</kbd>,
  <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Y</kbd>).
  Typing in the same field within 1.2 s is one step, automatic layout fixes are
  not recorded, and text fields keep their native undo.
- Renaming or deleting a class also updates or removes it in walkthroughs.
- Tests: `analyseFlow` and the sequence generator, `ScenarioRule`, the history
  reducer, and an e2e step that builds a valid walkthrough, adds an impossible
  call, checks that it is flagged, and exercises undo/redo by keyboard and
  toolbar.

### Critique / backlog
1. The feedback report's annotated diagram does not replay walkthroughs yet.
   Scenario findings appear only as text.
2. The sequence diagram preview is small in a 360 px panel. It needs an
   "open larger" view.
3. Return values and alternative paths (e.g. "lot full") are not modelled.
   Walkthroughs are linear call chains only.
4. Undo history is lost on reload. That is acceptable, because the draft itself
   is autosaved.
5. Carried over: Groq still can't be reached from this environment, and canvas
   editing is still desktop-first.

---

## Iteration 6: a distinct identity, and the curveball

**Critique going in:** the home page looked like a generic SaaS template (a
headline, five step cards, a grid). The report was a long text document that
ended at a number. Nothing tested what interviewers actually push on next:
*what happens to your design when the requirements change?*

**Done:**
- **The curveball.** After feedback, the report offers the interviewer's change
  request (the problem's extension scenario). Taking it tags the draft with a
  `challenge`, and the workspace then shows a curveball banner with a **live
  blast-radius counter** ("vs v1: +5 new · 2 changed · 10 untouched"). New and
  changed classes are tagged on the canvas as you work.
- **Change impact on the report.** For every revision, the annotated diagram has
  a view switch: *Findings* / *Change since vN* / *Walkthroughs*. The impact view
  colours classes (green new, amber changed, with the exact changes on hover) and
  gives an open/closed verdict with per-class change lists. A curveball response
  opens on this view, under a "Curveball result" card.
- **Walkthrough replay on the report:** submitted scenarios are drawn over the
  diagram read-only, with the sequence diagram.
- **Sequence diagrams can be expanded** into a dialog.
- **Home page redesign:** a drafting-grid hero whose diagram assembles itself
  (classes, a numbered walkthrough, and a curveball class tagged *new*). The
  three distinctive features are named ("Draw real UML", "Walk it through",
  "Take the curveball"). Problem cards have a difficulty accent and a best-score
  ring, and the primary action suggests the easiest problem not tried yet.
- **Score reveal:** large score rings count up once (instant with reduced motion).
- **Keyboard-shortcuts sheet** (`?` or the keyboard button in the workspace).
- Tests: `diffDesigns` (extension vs modification, renames, name fallback,
  ripple), the challenge reducer action, and an e2e step that takes the curveball,
  checks the live banner and canvas tags, and checks the curveball verdict and
  walkthrough replay on the v2 report (accessibility audited).

### Critique / backlog
1. The curveball is always the problem's single extension scenario. A small pool
   of change requests per problem would make repeat practice fresher.
2. The blast radius is shown but not scored. It could feed the extensibility
   criterion, once there's evidence it doesn't penalise legitimate refactors.
3. The hero illustration is hidden on phones (it's too small to read there).
4. The Groq reviewer is still unverified live from this environment. The first
   Render deploy with `GROQ_API_KEY` is where it will first run for real.

---

## Iteration 7: a curveball deck, interview mode, achievements

PR #1 was merged. `main` was verified from a fresh clone: typecheck, all unit
tests, the production build and the full e2e walkthrough. This iteration starts
from that `main`.

**Done:**
- **A curveball deck:** three change requests per problem (e.g. Parking Lot: EV
  charging, pay by UPI or wallet, a valet floor), each tagged with the variation
  points it stresses. The report offers the deck, marks curveballs already
  played, and preselects the first unplayed one. The workspace banner and the
  result card name the chosen curveball.
- **Seams that paid off:** `diffDesigns` now reports new classes that extend or
  implement an abstraction that already existed, and the curveball result lists
  them ("CardPayment plugged into your existing PaymentProcessor").
- **Interview mode:** "Timed interview" on the problem page (or the timer button
  in the workspace) starts a countdown of the problem's estimated time. It turns
  amber in the last five minutes and counts overtime in red. It announces time's
  up once and never blocks. The report shows "38 of 45 min". The timer ends with
  its submission.
- **Achievements**, computed on the server from what was actually submitted:
  first blueprint, iterator, walked it through, open for extension, seam finder,
  beat the clock, no hints needed, 90 club, hard mode, full catalogue (with
  progress). They are shown on Progress, earned first.
- Submission summaries carry `curveballId` and `timed`.
- Fixed a rules-of-hooks bug on the Progress page: `useState` was called after an
  early return on error.
- Considered a skill radar for the Progress page and dropped it: the criterion
  averages are magnitudes, which the existing bars show more readably.
- Tests: achievements (5 unit tests), seams in `diffDesigns`, and e2e steps for
  picking a curveball from the deck ("Played" marking, named result), achievements
  earned on Progress, and a timed interview (countdown, stop).

### Critique / backlog
1. The curveball deck is authored per problem. An AI-generated curveball
   (grounded on the problem's variation points) would make the deck endless.
2. Achievements are not announced when earned. A toast on the report that earns
   one would close the loop.
3. Interview mode has no "presentation" step (e.g. a 2-minute written summary)
   yet.
4. Still carried over: Groq has not been verified live, pending the first Render
   deploy.

---

## Iteration 8: curveballs aimed at your design, and achievement moments

PR #2 was merged, and this iteration starts from that `main`.

**Done:**
- **Adaptive curveball ("Aim one at my design").** `POST /api/submissions/:id/curveball`
  finds the point of change the submitted design is least ready for: first one
  with no abstraction, then an abstraction with no implementations, then the
  least-exercised seam. It uses the same keyword matching as the scoring rule, so
  it agrees with the report. It names the class that holds the behaviour today
  and turns that into a change request.
  - Wording: when a real model is configured (Groq or Claude), it writes the
    curveball in an interviewer's voice, told not to hint at a solution. Its JSON
    is validated with Zod, and any failure or unusable answer falls back to a
    deterministic template. The offline simulator always uses the template.
  - The generated curveball is stored in the draft's challenge (`custom`), so the
    workspace banner, change impact and result card work exactly as for deck
    curveballs.
  - The card explains why it was chosen ("Aimed at fee calculation: your
    least-exercised seam (PricingStrategy)") and is labelled *AI* or *Tailored*.
- **Achievement toasts:** when a report finishes, newly earned achievements are
  announced once per browser, with a link to Progress. A learner with history on
  a new browser is caught up silently rather than flooded.
- **Toast contrast fix:** sonner's rich colours failed WCAG AA (4.25:1). They are
  now mapped onto our contrast-checked tokens. The e2e audit also reports the
  measured colours and waits for toast transitions to settle.
- Tests: target selection and template wording (3), the service with valid,
  invalid and failing model answers and ownership (3), HTTP (template wording,
  404 for another learner), and e2e steps for the toast after v1 and for
  generating, taking and opening an adaptive curveball.

### Critique / backlog
1. The adaptive curveball targets one point of change at a time. A harder mode
   could combine two (e.g. a new pricing rule *and* a new payment method).
2. The AI wording path is covered by unit tests with a fake model only. It will
   first run for real on the Render deploy with `GROQ_API_KEY`.
3. Achievement toasts depend on the report page being open when evaluation
   finishes. A learner who navigates away sees the achievement on Progress, not
   as a toast.

---

## Iteration 9: submission polish, graded against the brief

PR #3 was merged. This iteration came from a review of everything built so far
against the assignment's deliverables and weights. It found little missing in the
product, and more missing in evidence and documentation.

**Done:**
- **Fairness evidence** (`apps/api/test/unit/fairness.test.ts`): a
  strategy-and-inheritance design and an enum-based design (different names for
  every seam) score 100 and 100 on the rules alone, and 90 and 88 with the offline
  reviewer. A god-class design scores 52 (42). This backs the brief's
  "more than one valid solution" question with a test, not a claim.
- **Two scoring rules recalibrated**, found by that test:
  - an empty trade-offs section is now *critical*, which caps the criterion at 50
    (it scored 80 before);
  - a class clearly over the responsibility limit (by 2 or more) is now a
    *major* issue, while one just over the limit stays a minor nudge.
- **`PracticeContext` domain value object:** the one place that interprets a
  submission's curveball and interview timing. The DTO mapping and achievements
  no longer re-derive them from the draft. A stale schema comment ("never
  evaluated") was corrected.
- **See a sample report:** `POST /api/problems/:id/sample` starts a real attempt
  from a worked sample (`problems/samples/parking-lot.json`, validated at
  startup) and submits it through the normal pipeline. The home page offers it,
  so a reviewer sees feedback, walkthroughs and the curveball deck in seconds.
- **CI** (`.github/workflows/ci.yml`): typecheck, all tests and the build, then
  the e2e walkthrough against the production server with screenshots uploaded.
  The e2e script falls back to Playwright's own Chromium outside the sandbox.
- **Docs:** `DESIGN.md` updated (current MVP, flow, architecture and class
  diagram) and given a section answering the brief's five design questions with
  evidence. The README gains a 5-minute reviewer tour, a CI badge and fixed stale
  sections. `RESEARCH.md` links curveballs and walkthroughs to research gaps.
  `AI_USAGE.md` records a more significant AI decision and the human's decisions.
  `PLAN.md` is marked as historical.

### Critique / backlog
1. Still the top risk: the live AI (Groq) path has not run outside tests. It
   needs the Render deploy with a fresh key.
2. Only Parking Lot has a worked sample.
3. The fairness test covers one problem. Each problem should have its own pair
   of valid designs.

---

## Iteration 10: free deployment (Render + Supabase Postgres)

**Why:** the Render Blueprint needed a paid plan, because only paid plans have a
persistent disk for the SQLite file. The goal was a deployment that costs nothing.

**Done:**
- **A Postgres storage adapter**, behind the same ports as SQLite (attempts,
  submissions, evaluations, and the job queue with `FOR UPDATE SKIP LOCKED`).
  It is used when `DATABASE_URL` is set, and the tables are created on start.
  `Storage` is now one object that the container receives, so the application
  layer doesn't know which engine it runs on.
- **Tested on real Postgres twice:**
  - the whole HTTP integration suite runs on PGlite (Postgres compiled to WASM),
    and CI now runs it (`npm run test:postgres`);
  - the production build ran against a real PostgreSQL 16 server through the
    `pg` driver, and the full e2e walkthrough passed with the data stored in
    Postgres.
- **The Blueprint is on Render's free plan** with no disk, and prompts for
  `GROQ_API_KEY` and `DATABASE_URL` (Supabase's Session pooler string, which works
  over IPv4).

### Critique / backlog
1. Free-plan cold starts (about a minute after 15 minutes idle) will be the first
   thing a reviewer notices. A paid instance, or an uptime pinger, removes them.
2. The worker still runs inside the web process. On Postgres it could move to its
   own process without code changes to the queue.
