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

## 4. Rename propagation in the editor (a bug the AI introduced and then caught)

- **Suggested:** relationships and traceability reference classes by name, and
  renaming a class rewrites every matching reference.
- **Problem found in review:** while typing, names collide transiently (renaming
  `Ca` → `Car` while a `Car` already exists). The naive rewrite would silently
  re-point the *other* class's relationships.
- **Decision:** propagate a rename only when both the old and new names identify
  that entity unambiguously. There is a regression test for exactly this sequence
  (`draft-reducer.test.ts`).

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

## Where AI was *not* used for judgement

- The rubric criteria and weights, the point-of-change definitions per problem,
  and the rule thresholds (e.g. god class > 6 responsibilities) are explicit,
  reviewable data and constants, not model output.
- Without an API key, the "AI" reviewer is an offline simulator and the UI labels
  it **AI (sim)** everywhere, so demo output is never presented as a model's
  judgement.
