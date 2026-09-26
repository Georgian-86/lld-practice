import { useQuery } from '@tanstack/react-query';
import type { AttemptDTO, ProblemSummaryDTO } from '@blueprint/shared';
import { ArrowRight, CheckCircle2, Clock, ListChecks, PenTool } from 'lucide-react';
import { Link } from 'react-router';
import { api, queryKeys } from '@/api/client';
import { PageContainer } from '@/components/app-shell';
import { ErrorView } from '@/components/error-view';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/misc';
import { ScorePill, ScoreRing } from '@/components/ui/score';
import { DifficultyBadge } from '@/features/problems/difficulty';
import { LandingFeatures, LandingHero, LandingSteps } from '@/features/problems/landing';
import { useStartSample } from '@/features/problems/use-start-attempt';
import { cn } from '@/lib/cn';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { plural, timeAgo } from '@/lib/format';

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
    <>
      <LandingHero
        primary={starter ? { to: `/problems/${starter.id}`, label: recent ? `Try ${starter.title}` : `Start with ${starter.title}` } : undefined}
        onSample={sampleProblem ? () => sample.mutate(sampleProblem.id) : undefined}
        sampleLoading={sample.isPending}
      />
      <LandingFeatures />
      <LandingSteps />
      <PageContainer className="pt-14">
        {recent && <ContinueCard attempt={recent} />}

        <section aria-labelledby="problems-heading">
          <div className="mb-4 flex items-end justify-between">
            <div>
              <h2 id="problems-heading" className="text-[24px] font-semibold tracking-tight text-fg">
                Problems
              </h2>
              <p className="text-[13px] text-muted">{data ? `${plural(data.length, 'problem')} · ${practiced} practiced` : 'Loading catalogue…'}</p>
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
    </>
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
