# Blueprint: LLD practice with explainable feedback

Blueprint helps learners **practise Low-Level Design repeatedly** and understand
where a design can improve:

**choose a problem → design → submit → get feedback → review → try again.**

Learners **draw** their design on a UML canvas: classes and interfaces with
their members, relationships drawn by dragging between classes (with proper UML
notation), and requirements dragged onto the class that owns them. **Live design
checks run as they draw** and badge the classes they concern. Patterns,
trade-offs and an extension-scenario answer complete the submission. It is evaluated in the background by **15 deterministic
design rules** plus an **AI reviewer grounded on those rules** (Claude, or an
offline simulator when no API key is set). The learner gets a rubric score and
prioritised, explainable findings that link back into the editor. Every version
is kept, so they can see what each revision fixed.

| | |
|---|---|
| Research note | [`docs/RESEARCH.md`](docs/RESEARCH.md) |
| Design note | [`docs/DESIGN.md`](docs/DESIGN.md) (classes, interfaces, evaluation, trade-offs) |
| Iteration log | [`docs/ITERATIONS.md`](docs/ITERATIONS.md) (critique → backlog per iteration) |
| AI usage | [`AI_USAGE.md`](AI_USAGE.md) |
| Original plan | [`docs/PLAN.md`](docs/PLAN.md) |

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
GROQ_API_KEY=gsk_... npm run dev          # Groq (default model llama-3.3-70b-versatile)
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
docker run -p 8080:8080 -v blueprint-data:/data -e ANTHROPIC_API_KEY=... blueprint-lld
```

## Deploy (Render)

The repo contains a `Dockerfile` and a Render Blueprint (`render.yaml`). The Blueprint
defines one web service, with SQLite on a 1 GB persistent disk at `/data`.

1. Push this branch, or merge it into the branch you deploy from.
2. In Render: **New → Blueprint**, connect this repository, and pick that branch.
3. When prompted, set `ANTHROPIC_API_KEY` to use Claude, or leave it empty to run
   with the offline reviewer.
4. **Apply.** Render builds the image and health-checks `/api/health`. The app is
   then live at `https://blueprint-lld.onrender.com` (or the name you chose).

Every push to that branch redeploys. Attempts and feedback survive redeploys
because they live on the disk.

## Tests

```bash
npm test             # shared (Mermaid parser) + API (unit + HTTP integration) + web (editor reducer)
npm run typecheck
npm run e2e          # real-browser walkthrough: needs the app running (BASE_URL, default :5173)
```

- **Unit:** state machine (every illegal transition), attempt invariants, all
  rules on good and bad designs, scoring caps, LLM output parsing and repair,
  hallucination guardrails, retry/timeout/cache decorators, and rename propagation
  in the editor.
- **Integration (HTTP):** the whole loop (start → hint → submit → feedback →
  improve → compare → history). Also covers 400/404/409/422 cases, learner
  isolation, the AI outage → partial report → retry path, crash → retries →
  `failed`, and recovery of jobs abandoned by a dead worker.
- **E2E (`apps/web/e2e/run.mjs`):** drives Chromium through the full journey in
  light, dark and mobile layouts, saves screenshots, and **fails on any console
  error, uncaught exception, 5xx or horizontal overflow**.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3001` | HTTP port |
| `DATABASE_PATH` | `./data/blueprint.db` | SQLite file (attempts, submissions, reports, job queue) |
| `LLM_PROVIDER` | `auto` | `auto` (Claude if its key is set, else Groq if its key is set, else simulator), `anthropic`, `groq`, `simulated`, `none` (rules only) |
| `ANTHROPIC_API_KEY` | – | Enables the Claude reviewer |
| `GROQ_API_KEY` | – | Enables the Groq reviewer |
| `LLM_MODEL` | per provider | `claude-opus-5` (Anthropic) or `llama-3.3-70b-versatile` (Groq) |
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
  evaluation/      15 DesignRules, LLM reviewer (prompt, schema, guardrails),
                   LLM decorators (timeout/retry/cache), pipeline, scoring, comparison
  application/     PracticeService, EvaluationService, ProgressService
  infrastructure/  SQLite repositories + durable job queue, problem catalogue
apps/web      React + TanStack Query + Tailwind; workspace editor, report, compare, progress
packages/shared  Design IR, problem schema, DTOs, Mermaid parser/generator
problems/     Problem catalogue as validated JSON (rubric weights, points of change, hints)
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
- SQLite with a single process: fine for a prototype, not for horizontal
  scaling. The repository and queue interfaces are where Postgres or a real queue
  would slot in.
- The offline simulator's judgement is heuristic. Real qualitative feedback needs
  `ANTHROPIC_API_KEY`.
- Only four problems, and no authoring UI (problems are JSON files).
- The editor is designed for desktop. It works on tablets and phones, including a
  drawer for the brief, but it's not optimised for them.
- AI findings are matched across versions by title, which is best-effort. Rule
  findings are matched exactly.
