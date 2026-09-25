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
