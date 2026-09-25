import type { SubmissionDTO } from '@blueprint/shared';
import { Check, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/cn';

const STEPS = [
  { id: 'queued', label: 'Submitted', detail: 'Snapshot saved and queued for review' },
  { id: 'rules', label: 'Design checks', detail: '15 deterministic rules' },
  { id: 'ai', label: 'AI review', detail: 'Qualitative judgement, grounded on the checks' },
  { id: 'scoring', label: 'Feedback', detail: 'Scoring against the rubric' },
] as const;

function currentStep(submission: SubmissionDTO): number {
  if (submission.status === 'submitted') return 0;
  const message = submission.statusMessage ?? '';
  if (/AI reviewer/i.test(message)) return 2;
  if (/Scoring/i.test(message)) return 3;
  return 1;
}

export function EvaluationProgress({ submission }: { submission: SubmissionDTO }) {
  const step = currentStep(submission);
  const [elapsed, setElapsed] = useState(() => Math.max(0, Math.round((Date.now() - new Date(submission.submittedAt).getTime()) / 1000)));
  useEffect(() => {
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <Card className="mx-auto max-w-xl p-8">
      <div className="text-center">
        <div className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-primary-soft">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
        <h2 className="text-lg font-semibold tracking-tight">Reviewing version {submission.version}</h2>
        <p className="mt-1 text-[13px] text-muted" aria-live="polite">
          {submission.statusMessage ?? (submission.status === 'submitted' ? 'Queued — a reviewer will pick it up in a moment' : 'Starting…')}
          <span className="tabular-nums"> · {elapsed}s</span>
        </p>
      </div>
      <ol className="mt-8 space-y-0">
        {STEPS.map((s, i) => {
          const done = i < step;
          const active = i === step;
          return (
            <li key={s.id} className="relative flex gap-4 pb-6 last:pb-0">
              {i < STEPS.length - 1 && (
                <span className={cn('absolute left-[13px] top-7 h-[calc(100%-1.5rem)] w-px', done ? 'bg-primary' : 'bg-border')} aria-hidden />
              )}
              <span
                className={cn(
                  'relative z-10 grid size-7 shrink-0 place-items-center rounded-full border text-xs font-semibold',
                  done && 'border-primary-solid bg-primary-solid text-primary-fg',
                  active && 'border-primary bg-surface text-primary ring-4 ring-primary-soft',
                  !done && !active && 'border-border bg-surface text-subtle',
                )}
              >
                {done ? <Check className="size-3.5" /> : active ? <Loader2 className="size-3.5 animate-spin" /> : i + 1}
              </span>
              <div className="pt-0.5">
                <div className={cn('text-[13px] font-medium', done || active ? 'text-fg' : 'text-muted')}>{s.label}</div>
                <div className="text-xs text-muted">{s.detail}</div>
              </div>
            </li>
          );
        })}
      </ol>
      <p className="mt-8 border-t border-border pt-4 text-center text-xs text-muted">
        This runs in the background — you can leave this page. Your feedback will be in the problem’s history.
      </p>
    </Card>
  );
}
