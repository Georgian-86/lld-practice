import type { DesignModel, Draft, SubmissionFormat, SubmissionStatus } from '@blueprint/shared';
import { isTerminal } from '@blueprint/shared';
import { SubmissionLifecycle, type SubmissionEvent } from './submission-lifecycle';

export interface SubmissionSnapshot {
  id: string;
  attemptId: string;
  learnerId: string;
  problemId: string;
  version: number;
  format: SubmissionFormat;
  /** Exactly what the learner submitted (the draft at submit time). */
  draft: Draft;
  /** The normalised model every evaluator reads. */
  design: DesignModel;
  contentHash: string;
  hintsUsed: number;
  status: SubmissionStatus;
  statusMessage: string | null;
  submittedAt: string;
  updatedAt: string;
}

/**
 * An immutable snapshot of a learner's design plus its evaluation status.
 * Content never changes after creation; only the status moves, and only
 * through the lifecycle table.
 */
export class Submission {
  private constructor(private state: SubmissionSnapshot) {}

  static create(params: Omit<SubmissionSnapshot, 'status' | 'statusMessage' | 'submittedAt' | 'updatedAt'> & { now: Date }): Submission {
    const { now, ...rest } = params;
    const at = now.toISOString();
    return new Submission({ ...rest, status: 'submitted', statusMessage: null, submittedAt: at, updatedAt: at });
  }

  static restore(snapshot: SubmissionSnapshot): Submission {
    return new Submission({ ...snapshot });
  }

  get id() {
    return this.state.id;
  }
  get attemptId() {
    return this.state.attemptId;
  }
  get learnerId() {
    return this.state.learnerId;
  }
  get problemId() {
    return this.state.problemId;
  }
  get version() {
    return this.state.version;
  }
  get design() {
    return this.state.design;
  }
  get contentHash() {
    return this.state.contentHash;
  }
  get status() {
    return this.state.status;
  }
  get isSettled() {
    return isTerminal(this.state.status);
  }

  apply(event: SubmissionEvent, now: Date, message: string | null = null): void {
    this.state.status = SubmissionLifecycle.next(this.state.status, event);
    this.state.statusMessage = message;
    this.state.updatedAt = now.toISOString();
  }

  /** Progress note while evaluating (e.g. "AI reviewer is reading your design"). */
  annotate(message: string, now: Date): void {
    this.state.statusMessage = message;
    this.state.updatedAt = now.toISOString();
  }

  toSnapshot(): SubmissionSnapshot {
    return { ...this.state };
  }
}
