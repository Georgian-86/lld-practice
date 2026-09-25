import type { Draft } from '@blueprint/shared';
import { emptyDraft } from '@blueprint/shared';
import { ValidationError } from './errors';

export interface AttemptSnapshot {
  id: string;
  learnerId: string;
  problemId: string;
  draft: Draft;
  revealedHintLevels: number[];
  createdAt: string;
  updatedAt: string;
}

/**
 * One learner working on one problem. Owns the editable draft and the hints
 * the learner chose to reveal. Submissions are immutable snapshots taken from
 * the draft; the attempt itself never stores evaluation results.
 */
export class Attempt {
  private constructor(private state: AttemptSnapshot) {}

  static start(params: { id: string; learnerId: string; problemId: string; now: Date; draft?: Draft }): Attempt {
    const at = params.now.toISOString();
    return new Attempt({
      id: params.id,
      learnerId: params.learnerId,
      problemId: params.problemId,
      draft: params.draft ?? emptyDraft(),
      revealedHintLevels: [],
      createdAt: at,
      updatedAt: at,
    });
  }

  static restore(snapshot: AttemptSnapshot): Attempt {
    return new Attempt({ ...snapshot, revealedHintLevels: [...snapshot.revealedHintLevels] });
  }

  get id() {
    return this.state.id;
  }
  get learnerId() {
    return this.state.learnerId;
  }
  get problemId() {
    return this.state.problemId;
  }
  get draft() {
    return this.state.draft;
  }
  get revealedHintLevels(): readonly number[] {
    return this.state.revealedHintLevels;
  }

  isOwnedBy(learnerId: string): boolean {
    return this.state.learnerId === learnerId;
  }

  saveDraft(draft: Draft, now: Date): void {
    this.state.draft = draft;
    this.state.updatedAt = now.toISOString();
  }

  /**
   * Hints are progressive: level N can only be revealed after level N-1, so
   * the number of hints used is a meaningful signal on the feedback report.
   */
  revealHint(level: number, availableLevels: number[], now: Date): void {
    if (!availableLevels.includes(level)) {
      throw new ValidationError(`Hint level ${level} does not exist for this problem.`);
    }
    if (this.state.revealedHintLevels.includes(level)) return;
    const previous = availableLevels.filter((l) => l < level);
    const missing = previous.filter((l) => !this.state.revealedHintLevels.includes(l));
    if (missing.length > 0) {
      throw new ValidationError(`Reveal hint ${Math.min(...missing)} before hint ${level}.`);
    }
    this.state.revealedHintLevels = [...this.state.revealedHintLevels, level].sort((a, b) => a - b);
    this.state.updatedAt = now.toISOString();
  }

  toSnapshot(): AttemptSnapshot {
    return { ...this.state, revealedHintLevels: [...this.state.revealedHintLevels] };
  }
}
