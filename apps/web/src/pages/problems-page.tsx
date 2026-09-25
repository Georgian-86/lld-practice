import { useQuery } from '@tanstack/react-query';
import type { AttemptDTO, ProblemSummaryDTO } from '@blueprint/shared';
import { ArrowRight, CheckCircle2, Clock, FileSearch, ListChecks, PenTool, Route, Sparkles, Zap } from 'lucide-react';
import { Link } from 'react-router';
import { api, queryKeys } from '@/api/client';
import { PageContainer } from '@/components/app-shell';
import { ErrorView } from '@/components/error-view';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/misc';
import { ScorePill, ScoreRing } from '@/components/ui/score';
import { DifficultyBadge } from '@/features/problems/difficulty';
import { HeroDiagram } from '@/features/problems/hero-diagram';
import { useStartSample } from '@/features/problems/use-start-attempt';
import { cn } from '@/lib/cn';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { plural, timeAgo } from '@/lib/format';

const FEATURES = [
  { icon: PenTool, title: 'Draw real UML', text: 'Classes, interfaces and proper relationship notation on a canvas, checked live as you draw.' },
  { icon: Route, title: 'Walk it through', text: 'Click classes in call order to prove a requirement works, and get a sequence diagram of it.' },
  { icon: Zap, title: 'Take the curveball', text: 'The interviewer changes the requirements. See how many existing classes your design had to touch.' },
];

export function ProblemsPage() {
  useDocumentTitle(undefined);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: queryKeys.problems, queryFn: api.problems });
  const attempts = useQuery({ queryKey: queryKeys.attempts(), queryFn: () => api.attempts() });
  const recent = attempts.data?.[0];
  // Suggest the easiest problem not tried yet (the "continue" card covers work in progress).
  const order = { easy: 0, medium: 1, hard: 2 } as const;
  const sample = useStartSample();
  const sampleProblem = data?.find((p) => p.hasSample);
  const starter = [...(data ?? [])].sort((a, b) => order[a.difficulty] - order[b.difficulty]).find((p) => p.progress.attempts === 0) ?? data?.[0];
  const practiced = data?.filter((p) => p.progress.submissions > 0).length ?? 0;

  return (
    <PageContainer>
      <section className="relative -mx-4 mb-10 overflow-hidden rounded-none border-y border-border bg-surface sm:mx-0 sm:rounded-2xl sm:border">
        <div className="blueprint-grid absolute inset-0" aria-hidden />
        <div className="relative grid grid-cols-1 items-center gap-6 p-6 sm:p-10 lg:grid-cols-[1.05fr_1fr]">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary-soft px-2.5 py-1 text-xs font-medium text-primary-soft-fg">
              <Sparkles className="size-3.5" /> Low-level design, practised like the real interview
            </span>
            <h1 className="mt-4 text-[30px] font-semibold leading-[1.1] tracking-tight text-fg sm:text-[40px]">
              Draw the design.
              <br />
              Walk it through.
              <br />
              <span className="text-ai">Survive the curveball.</span>
            </h1>
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-muted">
              Every submission is checked by deterministic design rules and reviewed by AI. You’re scored on properties of your design, not on how closely it
              matches one “right” answer.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              {starter && (
                <Link to={`/problems/${starter.id}`}>
                  <Button variant="primary" size="lg" icon={<ArrowRight className="size-4" />}>
                    {recent ? `Try ${starter.title}` : `Start with ${starter.title}`}
                  </Button>
                </Link>
              )}
              {sampleProblem && (
                <Button size="lg" onClick={() => sample.mutate(sampleProblem.id)} loading={sample.isPending} icon={<FileSearch className="size-4" />}>
                  See a sample report
                </Button>
              )}
              <a href="#problems-heading" className="text-[13px] font-medium text-fg-2 underline-offset-4 hover:text-fg hover:underline">
                Browse all problems
              </a>
            </div>
          </div>
          <HeroDiagram className="mx-auto hidden w-full max-w-[540px] sm:block" />
        </div>
        <ul className="relative grid grid-cols-1 border-t border-border bg-surface/80 backdrop-blur sm:grid-cols-3">
          {FEATURES.map((f, i) => (
            <li key={f.title} className={cn('flex gap-3 p-5', i > 0 && 'border-t border-border sm:border-l sm:border-t-0')}>
              <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg', i === 2 ? 'bg-ai-soft text-ai' : 'bg-primary-soft text-primary-soft-fg')}>
                <f.icon className="size-4" />
              </span>
              <div>
                <div className="text-[13.5px] font-semibold text-fg">{f.title}</div>
                <div className="mt-0.5 text-[12.5px] leading-relaxed text-muted">{f.text}</div>
              </div>
            </li>
          ))}
        </ul>
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
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-solid text-primary-fg">
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
      <Card className="relative flex h-full flex-col overflow-hidden p-5 transition group-hover:-translate-y-0.5 group-hover:border-border-strong group-hover:shadow-md">
        <span
          className={cn(
            'absolute inset-x-0 top-0 h-[3px]',
            problem.difficulty === 'easy' ? 'bg-success' : problem.difficulty === 'medium' ? 'bg-warning' : 'bg-danger',
          )}
          aria-hidden
        />
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <DifficultyBadge difficulty={problem.difficulty} />
            <span className="inline-flex items-center gap-1 text-xs text-muted">
              <Clock className="size-3.5" /> ~{problem.estimatedMinutes} min
            </span>
          </div>
          {progress.bestScore !== null ? (
            <span className="-my-1 inline-flex items-center gap-2 text-xs text-muted">
              Best <ScoreRing score={progress.bestScore} size={40} stroke={4} />
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
