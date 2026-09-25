# AI usage

This project was built with **Claude Code** as a pair-programmer: it proposed
designs, wrote most of the code and tests, drove a real browser to screenshot
every screen, and critiqued its own output between iterations
(see `docs/ITERATIONS.md`). The decisions below are the ones where the AI's first
suggestion was *not* the one that shipped, or where it had to be constrained.

## 1. How to score a design: similarity vs. properties

- **Suggested:** store a reference solution per problem and score submissions by
  similarity to it (class-name overlap plus an LLM "how close is this" judgement).
- **Decision: rejected.** LLD has many valid answers. Similarity scoring
  penalises a learner who picks a defensible alternative, which is exactly the
  skill we want to reward. Problems instead declare *properties*: core concepts
  with synonyms, **points of change** that should sit behind an abstraction, and an
  extension scenario. Rules check those properties, never specific class names.

## 2. Should the LLM produce the score?

- **Suggested:** send the design to the LLM and ask for a 0–100 score and feedback.
- **Decision: accepted in part, heavily constrained.** The LLM judges the
  qualitative parts, but it receives the deterministic findings as trusted facts,
  must answer in a JSON schema (structured outputs, then Zod validation plus one
  repair retry), and its references to classes that don't exist are dropped. It can
  lift a criterion at most +25 above the rule evidence, and a critical rule finding
  caps the criterion at 50. Reason: scores need to be repeatable and explainable,
  and an unconstrained LLM contradicted obvious facts ("all requirements are
  covered" when two weren't).

## 3. Infrastructure for slow or failing evaluation

- **Suggested:** Redis + BullMQ for the job queue, and WebSockets for status updates.
- **Decision: rejected for the MVP.** The brief says a monolith is fine and the
  focus is LLD. The job queue is a `JobQueue` interface with a SQLite
  implementation (atomic claim, retries with backoff, stale-lock recovery on boot),
  and the client polls with a server-suggested interval. This gives the same
  reliability properties for a prototype with zero extra infrastructure, and the
  interface keeps the swap cheap. What *was* kept from the suggestion is the
  important behaviour: when the AI fails, the learner still gets the rule-based
  report (`evaluated_partial`) and can retry.

## 4. Who decides where the curveball aims: the model or the code?

- **Suggested:** for the "aim a curveball at my design" feature, send the design to
  the LLM and let it invent a change request that stresses the design.
- **Decision: rejected as stated, kept for wording only.** A model choosing the
  target can't be tested, varies between runs, and might aim at something the
  scoring rules consider fine. The **target is chosen deterministically**: the
  first point of change with no abstraction, then an abstraction with no
  implementations, then the least-exercised seam. It uses the same keyword
  matching as the scoring rule, so the curveball and the report agree. The model
  only rewrites the change request in an interviewer's voice. Its JSON is
  validated, and any failure falls back to a template, so the feature works
  offline and is unit-tested for valid, invalid and failing model answers.

## 5. Trusting the AI's own UI and feedback: the screenshot critique loop

- **Suggested:** after writing the UI, declare it done because it typechecks and
  the API tests pass.
- **Decision: rejected.** Every iteration ends with a Playwright walkthrough in
  real Chromium that screenshots each screen (light, dark, mobile) and **fails on
  any console error, uncaught exception, 5xx or horizontal overflow**. Reviewing
  those screenshots found bugs that tests didn't:
  - the diagram rendered `park(v): Ticket` as `park(v) : : Ticket`;
  - the mobile header overflowed by 20px;
  - the offline reviewer called `ParkingSpot` "the orchestrator" because it counted
    inheritance edges;
  - the offline reviewer awarded 100/100.

  All were fixed in iteration 2, with tests where possible.

## Decisions that came from the human, not the AI

- **From form to canvas.** The first versions used a form-based editor (tabs of
  fields). The human rejected it ("I don't want just a question-and-answer kind of
  thing") and asked for real diagramming. That redirected iteration 4 to the UML
  canvas, and later iterations to walkthroughs and curveballs.
- **A critique pass after every iteration.** The human required each iteration to
  start by criticising the previous one. That is why `docs/ITERATIONS.md` has a
  critique and backlog per iteration, and why several regressions (contrast, a
  hooks-order bug, over-generous scoring) were caught rather than shipped.
- **Evaluate against the brief before polishing further.** Asking for a review
  against the deliverables led to the fairness test, which exposed two scoring
  rules as too lenient (an empty trade-offs section scored 80, and a class with 8
  responsibilities was only a "minor" issue). Both were recalibrated.
- **Deployment target and provider.** Render with a persistent disk was chosen
  over a serverless host (SQLite and an in-process worker need a long-running
  process). Groq was added as a provider because it was the key available.

## Where AI was *not* used for judgement

- The rubric criteria and weights, the point-of-change definitions per problem,
  and the rule thresholds (e.g. god class > 6 responsibilities) are explicit,
  reviewable data and constants, not model output.
- Without an API key, the "AI" reviewer is an offline simulator and the UI labels
  it **AI (sim)** everywhere, so demo output is never presented as a model's
  judgement.
