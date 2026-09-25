import type { EvaluationService } from '../application/evaluation-service';
import type { Clock, JobQueue } from '../domain/ports';

export interface WorkerLogger {
  info(obj: object, msg?: string): void;
  warn(obj: object, msg?: string): void;
  error(obj: object, msg?: string): void;
}

export interface WorkerOptions {
  pollIntervalMs: number;
  concurrency: number;
  /** Delay before the n-th retry: base * 2^(n-1). */
  retryBaseMs: number;
  /** Jobs locked longer than this are considered abandoned by a dead worker. */
  staleAfterMs: number;
}

/**
 * In-process background worker. Polls the durable queue, runs evaluations,
 * and turns unexpected errors into bounded, backed-off retries. In a larger
 * deployment this same class runs in a separate process against a shared
 * queue — the web tier only enqueues.
 */
export class EvaluationWorker {
  private running = false;
  private loops: Promise<void>[] = [];
  private wake: (() => void) | null = null;

  constructor(
    private readonly queue: JobQueue,
    private readonly evaluations: EvaluationService,
    private readonly clock: Clock,
    private readonly options: WorkerOptions,
    private readonly log: WorkerLogger,
  ) {}

  async start(): Promise<void> {
    if (this.running) return;
    const released = await this.queue.releaseStale(new Date(this.clock.now().getTime() - this.options.staleAfterMs));
    if (released) this.log.warn({ released }, 'Released evaluation jobs abandoned by a previous run');
    this.running = true;
    this.loops = Array.from({ length: this.options.concurrency }, () => this.loop());
  }

  async stop(): Promise<void> {
    this.running = false;
    this.wake?.();
    await Promise.all(this.loops);
    this.loops = [];
  }

  /** Nudges an idle worker so newly enqueued jobs start without waiting a poll cycle. */
  notify(): void {
    this.wake?.();
  }

  /** Processes at most one job. Returns whether a job was processed. Used by tests. */
  async tick(): Promise<boolean> {
    const job = await this.queue.claimNext(this.clock.now());
    if (!job) return false;
    const started = Date.now();
    try {
      const outcome = await this.evaluations.evaluate(job.submissionId);
      await this.queue.complete(job.id);
      this.log.info({ submissionId: job.submissionId, outcome, ms: Date.now() - started }, 'Evaluation finished');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const willRetry = job.attempts < job.maxAttempts;
      const retryAt = willRetry
        ? new Date(this.clock.now().getTime() + this.options.retryBaseMs * 2 ** (job.attempts - 1))
        : null;
      await this.queue.fail(job.id, message, retryAt);
      await this.evaluations.recordFailure(
        job.submissionId,
        'We could not evaluate this submission. You can retry it.',
        willRetry,
      );
      this.log.error({ submissionId: job.submissionId, attempt: job.attempts, willRetry, err: message }, 'Evaluation failed');
    }
    return true;
  }

  /** Runs until the queue has no due jobs. Used by tests and scripts. */
  async drain(maxJobs = 100): Promise<number> {
    let processed = 0;
    while (processed < maxJobs && (await this.tick())) processed++;
    return processed;
  }

  private async loop(): Promise<void> {
    while (this.running) {
      let worked = false;
      try {
        worked = await this.tick();
      } catch (error) {
        this.log.error({ err: error instanceof Error ? error.message : String(error) }, 'Worker loop error');
      }
      if (!worked && this.running) {
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, this.options.pollIntervalMs);
          this.wake = () => {
            clearTimeout(timer);
            resolve();
          };
        });
      }
    }
  }
}
