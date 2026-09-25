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
