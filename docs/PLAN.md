# LLD Practice Platform — Build Plan

> **Historical document.** This is the plan written before any code, kept as a
> record of the starting point. The shipped product went further (UML canvas,
> walkthroughs, curveballs). For the current state see [`DESIGN.md`](DESIGN.md) and
> [`ITERATIONS.md`](ITERATIONS.md), which logs each change against this plan.

> Status: planning. This document is the blueprint for the 2-day build. It is written so every
> deliverable in the brief (research note, design note, prototype, tests, README, AI_USAGE) maps to
> a concrete piece of work below.

---

## 0. One-line product thesis

**"LeetCode-style practice loop for LLD, with feedback that explains *why* — grounded in
deterministic checks, enriched by an LLM, and tracked across attempts so learners can see
themselves improve."**

The core insight driving every decision: *LLD has many valid answers, so feedback must judge
properties of a design (coverage, responsibility, coupling, extensibility, justified trade-offs),
never similarity to one "correct" answer.*

---

## 1. Answers to the brief's five design questions (the spine of the project)

| Question | Our answer (to be defended in the design note) |
|---|---|
| **What must a learner provide for an attempt to be meaningful?** | A *structured design*, not free prose: (1) entities/classes with responsibilities, (2) interfaces/abstractions, (3) relationships (association, composition, inheritance, dependency), (4) a **requirement → class traceability map**, (5) patterns used **with justification**, (6) key trade-offs, (7) an answer to one "extension scenario" (e.g. *"add EV charging spots"*). Optional: code skeleton / Mermaid class diagram. Structure is what makes evaluation explainable. |
| **What makes feedback useful when many solutions are valid?** | Rubric-based, property-level findings. Each finding has: criterion, severity, **evidence** (points at the learner's own entity/relationship), and a concrete suggestion. Feedback acknowledges alternatives ("Strategy or a simple enum are both fine here; enum is weaker if pricing rules grow"). Strengths are reported, not just defects. Score is secondary to findings. |
| **Deterministic vs LLM?** | **Deterministic:** schema validity, completeness, requirement coverage, core-concept presence (synonym-aware), structural smells (god class, cycles, orphan classes, missing abstraction at declared variation points, inheritance depth), pattern named-but-unjustified. **LLM:** quality of responsibilities, whether abstractions fit, trade-off reasoning, extension-scenario answer, alternative designs, natural-language coaching. LLM is *grounded* on deterministic facts and constrained to a JSON schema; it cannot contradict hard facts. |
| **How to add another evaluation approach / submission format?** | `SubmissionParser` registry normalises any format (structured form, Mermaid, code skeleton) into a common `DesignModel` IR. `Evaluator` interface + `CompositeEvaluator` pipeline — add a new evaluator by registering a class. `LlmClient` interface decouples provider. Rubrics are data, not code. |
| **What if evaluation is slow or fails?** | Submission is accepted immediately (`SUBMITTED`), evaluation runs as a background job (in-process queue, persisted in SQLite). UI polls status. Timeout + bounded retry with backoff for the LLM step. If LLM fails, the learner still gets deterministic feedback (`EVALUATED_PARTIAL`) with a "retry AI review" action. Jobs survive restarts (re-queued on boot). |

---

## 2. MVP scope

### In scope
1. **Problem catalogue** — 4 curated problems: Parking Lot, Elevator System, Vending Machine, Library Management (plus schema to add more as JSON/YAML).
   Each has: statement, functional + non-functional requirements (IDs like `FR-1`), constraints, difficulty, core concepts, declared *variation points*, extension scenario, progressive hints, rubric weights.
2. **Practice workspace** — structured design editor:
   - Entities table (name, kind: class/interface/abstract/enum, responsibilities, key methods/attributes)
   - Relationships editor (from, to, type, multiplicity)
   - Requirement traceability (each FR → one or more entities)
   - Patterns + justification, trade-offs, extension-scenario answer
   - Optional Mermaid `classDiagram` tab with live preview (parsed into the same model)
   - Autosave draft; timer; progressive hints (hint usage recorded on the attempt)
3. **Submission** — validation (client + server), immutable snapshot, status lifecycle visible in UI.
4. **Feedback report** — overall score + per-criterion breakdown, strengths, prioritised improvements, each finding with evidence + suggestion + source badge (`Rule` / `AI`), and "what a strong design usually includes" discussion (not a single model answer).
5. **History & improvement** — attempts per problem, score trend, **attempt-to-attempt diff** (findings resolved / new / persisting), "Try again" that forks the last submission into a new draft.
6. **Reliability** — background evaluation, retry, timeout, partial results, re-evaluate.

### Explicitly out of scope
Auth beyond a single demo learner (a `learnerId` is threaded through so multi-user is trivial later), payments, LMS features, admin UI for authoring problems, microservices/K8s, real-time collaboration, code execution sandbox.

---

## 3. Research note plan (`docs/RESEARCH.md`, 1–2 pages)

- **Learner problem:** LLD is open-ended; learners don't know if their design is "good"; interview prep resources give one reference solution which trains memorisation; no feedback loop; hard to self-assess trade-offs.
- **Approaches surveyed:** LeetCode/HackerRank (great loop, only for algorithmic correctness), Educative/Grokking OOD & GitHub `awesome-low-level-design` repos (static reference answers), CodeZym / LLD-specific judge sites (run code against tests — checks behaviour, not design), mock-interview platforms (Pramp/interviewing.io — human feedback, expensive, not repeatable), generic ChatGPT review (helpful but inconsistent, ungrounded, no history), static-analysis tools (SonarQube — code smells but no domain awareness).
- **Gaps:** no structured submission format; feedback either absent, binary, or unexplainable; no tracking of improvement; single reference answer penalises valid alternatives.
- **Direction:** structured submission + hybrid rubric evaluation + attempt history with diffs.

---

## 4. Architecture (simple monolith)

```
┌──────────── web (React + Vite + TS) ─────────────┐
│ ProblemList → Workspace → SubmissionStatus →     │
│ FeedbackReport → History/Compare                  │
└───────────────────────┬──────────────────────────┘
                        │ REST (JSON)
┌───────────────────────▼──────────────────────────┐
│ api  (Node + TS, Fastify)                         │
│  routes → application services → domain           │
│                    │                               │
│         EvaluationWorker (in-process, polling)    │
│                    │                               │
│  infrastructure: SQLite repos, JobQueue, LlmClient│
└───────────────────────────────────────────────────┘
```

**Stack (recommended):** TypeScript end-to-end (shared domain types), Fastify, SQLite via `better-sqlite3`, Zod for validation of both API input and LLM output, React + Vite + Tailwind, Mermaid for diagram preview, Vitest + Supertest, Anthropic SDK with a deterministic `FakeLlmClient` so the whole app runs and tests pass with **no API key**.

Layering (hexagonal-lite): `domain` has zero framework imports; `application` orchestrates use cases; `infrastructure` implements ports; `http` is a thin adapter.

---

## 5. Domain design (the 25% section — most care goes here)

### 5.1 Core entities

```
Problem ──< Requirement
   │    ──< RubricCriterion (id, name, weight, description)
   │    ──< Hint (level 1..3)
   │    └─ ProblemSpec: coreConcepts[], variationPoints[], extensionScenario
   │
Learner ──< Attempt ──< Submission (immutable, versioned) ──1 Evaluation ──< Finding
```

- **`Problem`** (value-rich aggregate, loaded from `problems/*.json`)
- **`Attempt`** — aggregate root for one learner's work on one problem. Holds the draft, hint usage, and ordered submissions. Enforces invariants: can't submit an empty/invalid draft; can't submit while one is `EVALUATING` (or: allowed, queues a new version — decision documented).
- **`Submission`** — immutable snapshot `{ id, attemptId, version, format, rawContent, designModel, contentHash, submittedAt, status }`.
- **`Evaluation`** — `{ submissionId, status, score, criterionScores[], findings[], evaluatorVersions, startedAt, completedAt, error? }`.
- **`Finding`** — `{ criterionId, severity: info|minor|major|critical, kind: strength|issue|suggestion, message, evidence: { entity?, relationship?, requirementId? }, suggestion, source: RULE|LLM, ruleId? }`.

### 5.2 Submission state machine (State pattern / explicit transition table)

```
DRAFT → SUBMITTED → EVALUATING → EVALUATED
                         │  └──→ EVALUATED_PARTIAL (rules ok, AI failed) → (retry AI) → EVALUATING
                         └────→ FAILED (unexpected) → (retry) → SUBMITTED
```
`SubmissionStatus` transitions guarded in one place (`SubmissionLifecycle.transition(from, event)`) — illegal transitions throw `InvalidTransitionError` (tested).

### 5.3 Normalised design IR — the key extensibility seam

```ts
interface DesignModel {
  entities: Entity[];          // name, kind, responsibilities[], methods[], attributes[]
  relationships: Relationship[]; // from, to, type, multiplicity?
  requirementMap: Record<RequirementId, EntityName[]>;
  patterns: { name: string; appliedTo: string[]; justification: string }[];
  tradeOffs: string[];
  extensionAnswer: string;
  notes?: string;
}
```

### 5.4 Ports / interfaces

```ts
interface SubmissionParser {                 // Strategy + Registry
  readonly format: SubmissionFormat;         // 'structured' | 'mermaid' | 'code-skeleton'(later)
  parse(raw: unknown): Result<DesignModel, ParseError[]>;
}

interface Evaluator {                        // Strategy; composed by CompositeEvaluator
  readonly id: string; readonly version: string;
  readonly kind: 'deterministic' | 'llm';
  evaluate(ctx: EvaluationContext): Promise<EvaluatorOutput>; // findings + criterion signals
}

interface DesignRule {                       // each deterministic check = one small class
  readonly id: string; readonly criterionId: string;
  check(model: DesignModel, problem: Problem): Finding[];
}

interface LlmClient { complete(req: LlmRequest): Promise<string>; }   // Anthropic | Fake
interface ScoreAggregator { aggregate(outputs, rubric): ScoreCard; }  // weighted, rules cap LLM
interface JobQueue { enqueue(job); claimNext(); complete(id); fail(id, err, retryAt?); }
interface AttemptRepository, SubmissionRepository, EvaluationRepository, ProblemCatalog
interface Clock, IdGenerator                // injected for deterministic tests
```

### 5.5 Patterns used deliberately (and named in the design note)
- **Strategy** — `SubmissionParser`, `Evaluator`, `DesignRule`, `LlmClient`
- **Composite / Pipeline** — `CompositeEvaluator` runs deterministic evaluators first, passes their facts into the LLM evaluator's context
- **Registry** — parser/evaluator/rule registries (open/closed: add without editing)
- **State** — submission lifecycle
- **Repository** — persistence ports
- **Decorator** — `RetryingLlmClient`, `TimeoutLlmClient`, `CachingLlmClient` (by content hash) wrap the base client
- **Template/Builder** — `PromptBuilder` assembles grounded prompts from problem + model + rule facts

### 5.6 Deterministic rule set (v1)
| Rule | Criterion |
|---|---|
| `SchemaCompletenessRule` — required sections non-empty | Completeness |
| `RequirementCoverageRule` — each FR mapped to ≥1 existing entity; mapped names exist | Requirement coverage |
| `CoreConceptRule` — problem's core concepts present (synonym/fuzzy match, e.g. `Slot`≈`Spot`) | Domain modelling |
| `GodClassRule` — entity with > N responsibilities or linked to > M entities | Responsibility / SRP |
| `AnemicOrphanRule` — entity with no responsibilities or no relationships | Cohesion |
| `CyclicDependencyRule` — cycles in dependency/association graph | Coupling |
| `VariationPointAbstractionRule` — declared variation point (e.g. pricing, dispatch algorithm) has an interface/abstract class | Extensibility |
| `DeepInheritanceRule` — depth > 3, or inheritance used where composition expected | Relationships |
| `UnjustifiedPatternRule` — pattern listed with trivial justification | Pattern use |
| `DanglingReferenceRule` — relationships pointing to undefined entities | Consistency |

### 5.7 LLM evaluator
- Input: problem spec + rubric + learner's `DesignModel` + **deterministic findings** (as facts).
- Output: strict JSON (Zod-validated): per-criterion rating 1–5 with rationale, findings with evidence referencing learner entity names, strengths, alternative approaches, one "next step" coaching prompt.
- Guardrails: evidence entity names validated against model (hallucinated references dropped); ratings on criteria that rules marked as hard-failed are capped; invalid JSON → one repair retry → else partial result.
- `FakeLlmClient` returns deterministic, plausible output → demo & tests without keys. Model configurable via env.

### 5.8 Scoring
Weighted by problem rubric (e.g. Coverage 20, Domain modelling 20, Responsibilities 20, Relationships 15, Extensibility 15, Trade-offs 10). Deterministic signals set floors/caps; LLM ratings fill the qualitative criteria. Score is shown *with* a "confidence" note when AI was unavailable.

---

## 6. Application services (use cases)
- `ProblemService.list/get`
- `AttemptService.start(learnerId, problemId)` / `saveDraft` / `useHint` / `retryFrom(submissionId)`
- `SubmissionService.submit(attemptId)` → validate → parse → persist → enqueue → return `{submissionId, status}`
- `EvaluationService.run(submissionId)` (called by worker) / `retryAi(submissionId)`
- `HistoryService.listAttempts(learnerId, problemId?)` / `compare(submissionA, submissionB)` → resolved / new / persisting findings + score delta

## 7. REST API
```
GET  /api/problems                      GET /api/problems/:id
POST /api/attempts                      GET /api/attempts/:id
PUT  /api/attempts/:id/draft            POST /api/attempts/:id/hints
POST /api/attempts/:id/submissions      GET /api/submissions/:id  (status + evaluation)
POST /api/submissions/:id/retry         POST /api/attempts/:id/fork?from=:submissionId
GET  /api/history?problemId=            GET /api/submissions/:a/compare/:b
GET  /api/health
```
Consistent error envelope `{ error: { code, message, details } }`; Zod-validated inputs.

## 8. Frontend screens
1. **Problems** — cards with difficulty, concepts, best score, attempt count.
2. **Workspace** — split view: requirements panel (checkboxes turn green as they're mapped) | design editor tabs (Entities · Relationships · Traceability · Patterns & Trade-offs · Extension · Diagram). Live Mermaid preview generated from the structured model. Hints drawer. Pre-submit checklist.
3. **Submission status** — stepper (Submitted → Rules checked → AI review → Done), polling, partial/failed states with retry.
4. **Feedback report** — score ring, criterion bars, strengths, prioritised issues (critical first), each with evidence chip linking to the entity, source badge, suggested alternatives, "Try again with this feedback".
5. **History** — timeline per problem, score trend sparkline, compare two attempts (resolved ✓ / new ✗ / persisting •).

## 9. Reliability details
- Job table: `id, submission_id, status, attempts, next_run_at, last_error, locked_at`.
- Worker loop in-process; claims jobs atomically; stale-lock recovery on boot.
- LLM: timeout (e.g. 30s), max 2 retries with exponential backoff, only on retryable errors (timeouts/429/5xx).
- Idempotency: same content hash re-uses cached LLM result.
- Everything observable via structured logs (pino) with submissionId.

## 10. Testing plan
- **Domain unit tests:** lifecycle transitions (legal + illegal), attempt invariants, each `DesignRule` with good/bad fixtures, score aggregator weighting & caps, compare/diff logic.
- **Parser tests:** structured + Mermaid happy path, malformed input, dangling refs, empty sections.
- **Evaluator pipeline tests:** LLM returns invalid JSON → repair → partial; LLM times out → `EVALUATED_PARTIAL`; hallucinated entity references dropped; retry succeeds on 2nd attempt.
- **API integration tests (Supertest):** full flow start → draft → submit → poll → feedback → history; 400 on invalid submission; 404 unknown problem; retry endpoint.
- **Edge cases:** submitting empty draft, duplicate submission, unknown problem id, enormous input (size limit), unicode names, restart with pending job.
- Target: fast (<10s), no network, `FakeLlmClient` + fake `Clock`.

## 11. Repository layout
```
/apps/api/src/{domain,application,infrastructure,http,worker}
/apps/api/test/{unit,integration,fixtures}
/apps/web/src/{pages,components,api,hooks}
/packages/shared/        # shared types + zod schemas
/problems/*.json         # problem catalogue (data, not code)
/docs/{RESEARCH.md, DESIGN.md, PLAN.md, diagrams/}
README.md  AI_USAGE.md
```

## 12. Deliverables checklist
- [ ] `docs/RESEARCH.md` (1–2 pages)
- [ ] `docs/DESIGN.md` — MVP, user flow, class diagram (Mermaid), interfaces, evaluation approach, trade-offs, "how it scales" (light HLD: separate worker process, real queue, rate-limit LLM)
- [ ] Working prototype, one-command start (`npm install && npm run dev`), seeded problems, demo works without API key
- [ ] Tests (`npm test`) incl. failure/edge cases
- [ ] `README.md` — run, architecture, key decisions, limitations, future work
- [ ] `AI_USAGE.md` — 3–5 decisions (accepted/rejected + why), written as work happens

## 13. Two-day schedule
| Block | Work |
|---|---|
| Day 1 AM | Research note; problem JSONs (4 problems, rubrics, hints); monorepo scaffold; shared schemas |
| Day 1 PM | Domain model + lifecycle + parsers + deterministic rules + aggregator, with unit tests |
| Day 1 EVE | Persistence, job queue, worker, LLM evaluator (Anthropic + Fake + decorators), API routes, integration tests |
| Day 2 AM | Frontend: problem list, workspace editor, Mermaid preview, submission status |
| Day 2 PM | Feedback report, history + compare, retry/partial UX, polish |
| Day 2 EVE | Design note, README, AI_USAGE, edge-case tests, demo run-through, cleanup |

## 14. Stretch ideas (only if time remains)
- "Interviewer mode": LLM asks one follow-up question on the design; learner answers; answer is evaluated.
- Mermaid → structured import (paste a diagram instead of filling forms).
- Code-skeleton submission format (TS/Java interfaces parsed via simple regex/AST) — proves the parser seam.
- Concept mastery radar across problems.

## 15. Key trade-offs to document
- Structured form vs free text: more friction for the learner, but enables explainable, deterministic feedback. Mitigated with Mermaid import and good defaults.
- In-process queue vs Redis/BullMQ: simpler, enough for a prototype; interface allows swap.
- SQLite vs Postgres: zero setup; repositories hide it.
- Rubric-based scoring vs reference-answer similarity: fairer to alternative designs; less "precise" number.
- LLM grounded on rule facts: more consistent, less creative; reduces hallucination.
