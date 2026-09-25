import { useQuery } from '@tanstack/react-query';
import type { AttemptDTO, ProblemSummaryDTO } from '@blueprint/shared';
import { ArrowRight, CheckCircle2, Clock, ListChecks, MessageSquareText, PenTool, RotateCcw, Send } from 'lucide-react';
import { Link } from 'react-router';
import { api, queryKeys } from '@/api/client';
import { PageContainer } from '@/components/app-shell';
import { ErrorView } from '@/components/error-view';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/misc';
import { ScorePill } from '@/components/ui/score';
import { DifficultyBadge } from '@/features/problems/difficulty';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { plural, timeAgo } from '@/lib/format';

const STEPS = [
  { icon: ListChecks, title: 'Pick a problem', text: 'Clear requirements and the likely points of change.' },
  { icon: PenTool, title: 'Design it', text: 'Classes, relationships, traceability, trade-offs.' },
  { icon: Send, title: 'Submit', text: 'Evaluated in the background — keep working.' },
  { icon: MessageSquareText, title: 'Get feedback', text: 'Rule checks plus an AI reviewer, all explained.' },
  { icon: RotateCcw, title: 'Iterate', text: 'Revise, resubmit and see what you fixed.' },
];

export function ProblemsPage() {
  useDocumentTitle(undefined);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: queryKeys.problems, queryFn: api.problems });
  const attempts = useQuery({ queryKey: queryKeys.attempts(), queryFn: () => api.attempts() });
  const recent = attempts.data?.[0];
  const practiced = data?.filter((p) => p.progress.submissions > 0).length ?? 0;

  return (
    <PageContainer>
      <section className="mb-10">
        <div className="max-w-2xl">
          <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-fg sm:text-[32px]">
            Practice low-level design,
            <br className="hidden sm:block" /> with feedback that explains itself.
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-muted">
            Model the classes, relationships and trade-offs for a real problem. Every submission is checked by
            deterministic design rules and reviewed by AI — and scored on properties of your design, not how closely it
            matches one “right” answer.
          </p>
        </div>
        <ol className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-5">
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex items-start gap-3 rounded-xl border border-border bg-surface p-3.5 shadow-xs sm:flex-col sm:gap-2.5">
              <div className="flex items-center gap-2">
                <span className="grid size-7 place-items-center rounded-lg bg-primary-soft text-primary-soft-fg">
                  <step.icon className="size-3.5" />
                </span>
                <span className="text-[11px] font-semibold tabular-nums text-subtle">0{i + 1}</span>
              </div>
              <div>
                <div className="text-[13px] font-semibold text-fg">{step.title}</div>
                <div className="mt-0.5 text-xs leading-relaxed text-muted">{step.text}</div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {recent && <ContinueCard attempt={recent} />}

      <section aria-labelledby="problems-heading">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h2 id="problems-heading" className="text-lg font-semibold tracking-tight">
              Problems
            </h2>
            <p className="text-[13px] text-muted">
              {data ? `${plural(data.length, 'problem')} · ${practiced} practiced` : 'Loading catalogue…'}
            </p>
          </div>
        </div>
        {error ? (
          <ErrorView error={error} onRetry={() => void refetch()} compact />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {isLoading || !data
              ? Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[212px] rounded-xl" />)
              : data.map((problem) => <ProblemCard key={problem.id} problem={problem} />)}
          </div>
        )}
      </section>
    </PageContainer>
  );
}

function ContinueCard({ attempt }: { attempt: AttemptDTO }) {
  const last = attempt.submissions.at(-1);
  return (
    <Link to={`/attempts/${attempt.id}`} className="group mb-8 block rounded-xl focus-visible:outline-offset-4">
      <Card className="flex flex-col gap-4 border-primary/25 bg-gradient-to-r from-primary-soft/70 to-surface p-5 transition group-hover:shadow-md sm:flex-row sm:items-center">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-fg">
          <PenTool className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold uppercase tracking-wide text-primary-soft-fg">Continue where you left off</div>
          <div className="mt-0.5 text-[15px] font-semibold text-fg">{attempt.problemTitle}</div>
          <div className="text-[13px] text-muted">
            {last ? `Version ${last.version} submitted ${timeAgo(last.submittedAt)}` : 'Draft in progress'} · edited {timeAgo(attempt.updatedAt)}
          </div>
        </div>
        {last?.overallScore != null && (
          <div className="flex items-center gap-2 text-[13px] text-muted">
            Last score <ScorePill score={last.overallScore} />
          </div>
        )}
        <span className="inline-flex items-center gap-1 text-[13px] font-medium text-primary">
          Open workspace <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
      </Card>
    </Link>
  );
}

function ProblemCard({ problem }: { problem: ProblemSummaryDTO }) {
  const { progress } = problem;
  const started = progress.attempts > 0;
  return (
    <Link to={`/problems/${problem.id}`} className="group block rounded-xl focus-visible:outline-offset-4">
      <Card className="flex h-full flex-col p-5 transition group-hover:border-border-strong group-hover:shadow-md">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <DifficultyBadge difficulty={problem.difficulty} />
            <span className="inline-flex items-center gap-1 text-xs text-muted">
              <Clock className="size-3.5" /> ~{problem.estimatedMinutes} min
            </span>
          </div>
          {progress.bestScore !== null ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted">
              Best <ScorePill score={progress.bestScore} />
            </span>
          ) : started ? (
            <Badge tone="primary">In progress</Badge>
          ) : null}
        </div>
        <h3 className="mt-3 text-base font-semibold tracking-tight text-fg">{problem.title}</h3>
        <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-muted">{problem.summary}</p>
        <div className="mb-4 mt-3 flex flex-wrap gap-1.5">
          {problem.tags.map((tag) => (
            <span key={tag} className="rounded-md bg-surface-2 px-2 py-0.5 text-xs text-fg-2">
              {tag}
            </span>
          ))}
        </div>
        <div className="mt-auto flex items-center justify-between border-t border-border pt-4 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5">
            {progress.submissions > 0 ? (
              <>
                <CheckCircle2 className="size-3.5 text-success" /> {plural(progress.submissions, 'submission')}
              </>
            ) : (
              <>
                <ListChecks className="size-3.5" /> {plural(problem.requirementCount, 'requirement')}
              </>
            )}
          </span>
          <span className="inline-flex items-center gap-1 font-medium text-primary">
            {started ? 'Continue' : 'Start practicing'}
            <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>
      </Card>
    </Link>
  );
}
