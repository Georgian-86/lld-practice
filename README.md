# Blueprint: LLD practice with explainable feedback

[![CI](https://github.com/Georgian-86/lld-practice/actions/workflows/ci.yml/badge.svg)](https://github.com/Georgian-86/lld-practice/actions/workflows/ci.yml)

**Live:** https://blueprint-lld.onrender.com (free hosting: the first visit after a
quiet spell takes about a minute to wake the server).

Blueprint helps learners **practise Low-Level Design repeatedly** and understand
where a design can improve:

**choose a problem → design → submit → get feedback → review → try again.**

- **Draw the design** on a UML canvas: classes, interfaces and enums with their
  members, typed relationships in proper UML notation, and requirement chips
  dropped onto the class that owns them. Live checks badge classes as you draw,
  and undo/redo is supported.
- **Walk it through:** click classes in call order to show how a requirement
  works. Each call is checked against the diagram (can this class actually reach
  that one?) and turned into a sequence diagram.
- **Explainable feedback:** 16 deterministic design rules plus an AI reviewer
  grounded on them (Claude or Groq, or an offline simulator clearly labelled
  *AI (sim)*). You get a weighted rubric score and findings tagged *Rule* or *AI*
  that point at your own classes and link back into the editor.
- **Take the curveball:** the interviewer's change requests, from a deck per
  problem or **aimed at your own design's weakest point of change**. The next
  report measures the **blast radius**: which classes were added, which existing
  ones had to change, which stayed untouched, and which abstractions paid off.
- **Keep improving:** every version is kept. You can compare versions, and track
  scores, weakest criteria and achievements. A timed interview mode counts down
  the problem's estimated time.

## Reviewer quick tour (5 minutes)

1. Open https://blueprint-lld.onrender.com. It runs the real Groq reviewer. To run
   locally instead: `npm install && npm run dev`, then http://localhost:5173 (no API
   key needed).
2. On the home page, click **See a sample report**. A worked Parking Lot design is
   submitted and evaluated in the background, and the report opens when it's ready.
3. On the report, switch the diagram between **Findings** and **Walkthroughs**,
   and open a finding's class link to jump into the editor.
4. In the curveball deck, click **Aim one at my design**, then **Take this
   curveball**. On the canvas, add a class that implements an existing interface
   and watch the banner's blast-radius counter. Submit, and the next report opens
   on **Change since v1**.
5. Open **Progress** for the score trend, criterion averages and achievements.

Design answers to the brief's five questions are in
[`docs/DESIGN.md` §5](docs/DESIGN.md#5-the-five-design-questions-answered).

| | |
|---|---|
| Research note | [`docs/RESEARCH.md`](docs/RESEARCH.md) |
| Design note | [`docs/DESIGN.md`](docs/DESIGN.md) (classes, interfaces, evaluation, trade-offs) |
| Iteration log | [`docs/ITERATIONS.md`](docs/ITERATIONS.md) (critique → backlog per iteration) |
| AI usage | [`AI_USAGE.md`](AI_USAGE.md) |
| Original plan (historical, day 1) | [`docs/PLAN.md`](docs/PLAN.md) |

## Quick start

Requires **Node.js ≥ 22.13** (uses the built-in `node:sqlite` driver, so there is no native build).

```bash
npm install
npm run dev          # API on :3001 + web on :5173 (proxying /api)
```

Open http://localhost:5173. **No API key is needed.** Without one, the AI
reviewer is an offline simulator, clearly labelled *AI (sim)* in the UI. To use a
real model, set one key:

```bash
GROQ_API_KEY=gsk_... npm run dev          # Groq (default model openai/gpt-oss-120b)
ANTHROPIC_API_KEY=sk-ant-... npm run dev  # Claude (default model claude-opus-5)
```

Keys are read from the environment only. Never commit them.

### Production (single process)

```bash
npm run build        # web → apps/web/dist, API → apps/api/dist/server.mjs
npm start            # serves the API, the web app and the evaluation worker on :3001
```

or with Docker:

```bash
docker build -t blueprint-lld .
docker run -p 8080:8080 -v blueprint-data:/data -e GROQ_API_KEY=... blueprint-lld
```

## Deploy (free: Render + Supabase)

The repo contains a `Dockerfile` and a Render Blueprint (`render.yaml`) for one web
service (API, web app and evaluation worker in one process) on Render's **free**
plan. The free plan has no persistent disk, so data lives in a free **Supabase**
Postgres database. The app switches to Postgres whenever `DATABASE_URL` is set, and
creates its tables on first start.

1. **Supabase:** create a project. In **Connect**, copy the **Session pooler**
   connection string (it works over IPv4, which Render needs), and put your
   database password in place of `[YOUR-PASSWORD]`.
2. **Render:** **New → Blueprint**, connect the GitHub repository, and choose `main`.
   When prompted, paste `GROQ_API_KEY` and `DATABASE_URL`. Every other setting
   comes from `render.yaml`.
3. **Apply.** The first build takes a few minutes. Then
   `https://<your-app>.onrender.com/api/health` should report
   `"aiReviewer":"groq:openai/gpt-oss-120b"`.

Free-plan caveats:
- The service sleeps after 15 minutes without traffic, and the next visit takes
  about a minute to wake it.
- A free Supabase project pauses after a week without activity. Resume it from the
  Supabase dashboard; no data is lost.
- Without `DATABASE_URL`, the app runs on a local SQLite file that is wiped on every
  restart.
- With a paid Render plan, you can use a persistent disk and SQLite instead: add a
  `disk` mounted at `/data` and remove `DATABASE_URL`.

Every push to `main` redeploys.

## Tests

```bash
npm test             # shared (Mermaid, walkthroughs, design diff) + API (unit + HTTP) + web (editor state)
npm run typecheck
npm run e2e          # real-browser walkthrough: needs the app running (BASE_URL, default :5173)
```

- **Unit:** state machine (every illegal transition), attempt invariants, all
  rules on good and bad designs, **fairness** (two structurally different valid
  designs score alike, a weak one clearly lower), scoring caps, LLM output parsing
  and repair, hallucination guardrails, retry/timeout/cache decorators, the Groq
  adapter, walkthrough analysis, design diff, curveball targeting with model
  fallback, achievements, practice context, and editor undo/redo and rename
  propagation.
- **Integration (HTTP):** the whole loop (start → hint → submit → feedback →
  improve → compare → history). Also covers 400/404/409/422 cases, learner
  isolation, the AI outage → partial report → retry path, crash → retries →
  `failed`, recovery of jobs abandoned by a dead worker, aimed curveballs, and the
  sample report.
- **E2E (`apps/web/e2e/run.mjs`):** drives Chromium through the full journey in
  light, dark and mobile layouts: drawing, undo, walkthroughs, submitting,
  curveballs, a timed interview, progress and the sample report. It runs axe
  accessibility audits on every screen, saves screenshots, and **fails on any
  console error, uncaught exception, 5xx, horizontal overflow, or serious or
  critical WCAG A/AA violation**.
- **CI** (`.github/workflows/ci.yml`) runs typecheck, all tests and the build,
  then the e2e walkthrough against the production server, on every PR.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3001` | HTTP port |
| `DATABASE_URL` | – | Postgres connection string (e.g. Supabase). When set, it is used instead of SQLite. |
| `DATABASE_PATH` | `./data/blueprint.db` | SQLite file, used when `DATABASE_URL` is not set |
| `LLM_PROVIDER` | `auto` | `auto` (Claude if its key is set, else Groq if its key is set, else simulator), `anthropic`, `groq`, `simulated`, `none` (rules only) |
| `ANTHROPIC_API_KEY` | – | Enables the Claude reviewer |
| `GROQ_API_KEY` | – | Enables the Groq reviewer |
| `LLM_MODEL` | per provider | `claude-opus-5` (Anthropic) or `openai/gpt-oss-120b` (Groq) |
| `LLM_EFFORT` | `medium` | `low` / `medium` / `high` |
| `LLM_TIMEOUT_MS` / `LLM_MAX_RETRIES` | `90000` / `2` | Per-call timeout and retries (retryable errors only) |
| `LLM_SIMULATED_LATENCY_MS` | `2500` | Makes the offline reviewer feel real in demos |
| `LLM_SIMULATED_FAILURE_RATE` | `0` | e.g. `0.5` to demo the partial-report and retry path |
| `WORKER_CONCURRENCY` | `2` | Parallel evaluations |

## How it is built

```
apps/api      Fastify API + in-process evaluation worker (TypeScript)
  domain/          Attempt, Submission, SubmissionLifecycle (state machine), ports
  formats/         SubmissionParser registry: structured form, Mermaid class diagram
  evaluation/      16 DesignRules, LLM reviewer (prompt, schema, guardrails),
                   LLM decorators (timeout/retry/cache), pipeline, scoring, comparison
  application/     PracticeService, EvaluationService, ProgressService, LintService,
                   CurveballService, achievements
  infrastructure/  SQLite repositories + durable job queue, problem catalogue
apps/web      React + TanStack Query + Tailwind; workspace editor, report, compare, progress
packages/shared  Design IR, problem schema, DTOs, Mermaid, walkthrough analysis, design diff
problems/     Problem catalogue as validated JSON (rubric weights, points of change, hints,
              curveballs); problems/samples/ holds worked sample designs
```

Key decisions (details in the design note):

- **Structured submission.** It makes feedback checkable and rehearses what
  interviewers probe for. Mermaid import/export keeps it fast.
- **A rubric of properties, not a reference answer.** Rules never look for specific
  class names, so alternative designs aren't penalised.
- **Rules establish the facts and the AI supplies judgement.** The AI is grounded
  on rule findings, schema-constrained, stripped of hallucinated class names, and
  capped (at most +25 above the rule evidence; a critical finding caps the
  criterion at 50).
- **Failure-tolerant evaluation.** A durable queue with retries and crash
  recovery. If the AI is down the learner still gets a rule-based report, and can
  retry the AI review.
- **Extensible by addition.** New format → `SubmissionParser`. New approach →
  `Evaluator` / `DesignRule`. New provider → `LlmClient`. New problem → a JSON
  file.

## Limitations

- There are no accounts. Each browser gets an anonymous learner id, so history
  doesn't follow you across devices.
- Storage is SQLite (a local file) or Postgres (`DATABASE_URL`), behind the same
  repository and queue interfaces. The Postgres queue claims jobs with
  `FOR UPDATE SKIP LOCKED`, so several instances could share it. The evaluation
  worker still runs inside the web process.
- The offline simulator's judgement is heuristic. Real qualitative feedback needs
  `GROQ_API_KEY` or `ANTHROPIC_API_KEY`. The Groq path is covered by tests against
  mocked HTTP. It has not yet run against the live API from the build environment,
  where outbound access to Groq was blocked.
- Only four problems (one with a worked sample), and no authoring UI (problems are
  JSON files).
- The blast radius of a curveball is measured and shown but not scored, because
  legitimate refactors also change classes.
- The editor is designed for desktop. It works on tablets and phones, including a
  drawer for the brief, but it's not optimised for them.
- AI findings are matched across versions by title, which is best-effort. Rule
  findings are matched exactly.
