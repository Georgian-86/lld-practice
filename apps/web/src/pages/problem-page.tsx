import { useQuery } from '@tanstack/react-query';
import type { AttemptDTO, ProblemDTO } from '@blueprint/shared';
import { CRITERIA, CRITERION_IDS } from '@blueprint/shared';
import { ArrowLeft, ArrowRight, Clock, FileText, Plus, Target, Timer } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { api, queryKeys } from '@/api/client';
import { PageContainer } from '@/components/app-shell';
import { ErrorView } from '@/components/error-view';
import { Markdown } from '@/components/markdown';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { SectionTitle, Skeleton } from '@/components/ui/misc';
import { ScorePill } from '@/components/ui/score';
import { DifficultyBadge } from '@/features/problems/difficulty';
import { useStartAttempt } from '@/features/problems/use-start-attempt';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { plural, timeAgo } from '@/lib/format';

export function ProblemPage() {
  const { problemId = '' } = useParams();
  const problem = useQuery({ queryKey: queryKeys.problem(problemId), queryFn: () => api.problem(problemId) });
  const attempts = useQuery({ queryKey: queryKeys.attempts(problemId), queryFn: () => api.attempts(problemId) });
  const start = useStartAttempt();
  useDocumentTitle(problem.data?.title);

  if (problem.error) return <ErrorView error={problem.error} onRetry={() => void problem.refetch()} />;
  if (!problem.data) return <ProblemSkeleton />;

  const p = problem.data;
  const latest = attempts.data?.[0];

  return (
    <PageContainer>
      <Link to="/" className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-fg">
        <ArrowLeft className="size-3.5" /> All problems
      </Link>

      <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2.5">
            <DifficultyBadge difficulty={p.difficulty} />
            <span className="inline-flex items-center gap-1 text-xs text-muted">
              <Clock className="size-3.5" /> ~{p.estimatedMinutes} min
            </span>
            <span className="text-xs text-subtle">·</span>
            <span className="text-xs text-muted">{p.tags.join(' · ')}</span>
          </div>
          <h1 className="text-[26px] font-semibold tracking-tight">{p.title}</h1>
          <p className="mt-1 max-w-2xl text-[15px] text-muted">{p.summary}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          {latest ? (
            <>
              <Button onClick={() => start.mutate({ problemId: p.id })} loading={start.isPending} icon={<Plus className="size-4" />}>
                New attempt
              </Button>
              <Link to={`/attempts/${latest.id}`}>
                <Button variant="primary" size="md">
                  Continue attempt <ArrowRight className="size-4" />
                </Button>
              </Link>
            </>
          ) : (
            <>
              <Button
                size="lg"
                onClick={() => start.mutate({ problemId: p.id, timed: true })}
                disabled={start.isPending}
                icon={<Timer className="size-4" />}
                title={`Starts a ${p.estimatedMinutes}-minute countdown, like a real interview`}
              >
                Timed interview
              </Button>
              <Button variant="primary" size="lg" onClick={() => start.mutate({ problemId: p.id })} loading={start.isPending}>
                Start attempt <ArrowRight className="size-4" />
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Card className="p-6">
            <SectionTitle className="mb-3">The problem</SectionTitle>
            <Markdown source={p.description} className="text-[14px] leading-relaxed text-fg-2" />
          </Card>
          <RequirementsCard problem={p} />
        </div>

        <aside className="space-y-6">
          <AttemptsCard attempts={attempts.data} loading={attempts.isLoading} />
          <Card>
            <CardHeader title="How you’re evaluated" icon={<Target className="size-4" />} description="Weights for this problem" />
            <ul className="space-y-3 px-5 py-4">
              {CRITERION_IDS.map((id) => (
                <li key={id}>
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="font-medium text-fg-2">{CRITERIA[id].name}</span>
                    <span className="tabular-nums text-muted">{p.rubric[id]}%</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-3">
                    <div className="h-full rounded-full bg-primary/70" style={{ width: `${(p.rubric[id] / Math.max(...Object.values(p.rubric))) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </Card>
          <Card className="p-5">
            <SectionTitle className="mb-3">What you’ll submit</SectionTitle>
            <ul className="space-y-2 text-[13px] text-fg-2">
              {[
                'Classes & interfaces with their responsibilities',
                'Relationships between them',
                'Which class owns each requirement',
                'Patterns you used, and why',
                'Trade-offs you made',
                'How your design absorbs one change',
              ].map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                  {item}
                </li>
              ))}
            </ul>
          </Card>
        </aside>
      </div>
    </PageContainer>
  );
}

function RequirementsCard({ problem }: { problem: ProblemDTO }) {
  return (
    <Card className="p-6">
      <SectionTitle className="mb-3">Functional requirements</SectionTitle>
      <ul className="space-y-2.5">
        {problem.functionalRequirements.map((r) => (
          <li key={r.id} className="flex gap-3 text-[14px] leading-relaxed text-fg-2">
            <span className="mt-0.5 h-5 shrink-0 rounded bg-primary-soft px-1.5 font-mono text-[11px] font-medium leading-5 text-primary-soft-fg">
              {r.id}
            </span>
            {r.text}
          </li>
        ))}
      </ul>
      {problem.nonFunctionalRequirements.length > 0 && (
        <>
          <SectionTitle className="mb-3 mt-6">Non-functional requirements</SectionTitle>
          <ul className="space-y-2.5">
            {problem.nonFunctionalRequirements.map((r) => (
              <li key={r.id} className="flex gap-3 text-[14px] leading-relaxed text-fg-2">
                <span className="mt-0.5 h-5 shrink-0 rounded bg-info-soft px-1.5 font-mono text-[11px] font-medium leading-5 text-info-soft-fg">
                  {r.id}
                </span>
                {r.text}
              </li>
            ))}
          </ul>
        </>
      )}
      {problem.constraints.length > 0 && (
        <>
          <SectionTitle className="mb-3 mt-6">Constraints & scope</SectionTitle>
          <ul className="list-disc space-y-1.5 pl-5 text-[13px] text-muted marker:text-subtle">
            {problem.constraints.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

function AttemptsCard({ attempts, loading }: { attempts?: AttemptDTO[]; loading: boolean }) {
  return (
    <Card>
      <CardHeader title="Your attempts" icon={<FileText className="size-4" />} />
      {loading ? (
        <div className="space-y-2 p-4">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      ) : !attempts?.length ? (
        <p className="px-5 py-5 text-[13px] text-muted">No attempts yet. Your drafts and feedback will appear here.</p>
      ) : (
        <ul className="divide-y divide-border">
          {attempts.slice(0, 5).map((a, i) => {
            const scores = a.submissions.map((s) => s.overallScore).filter((n): n is number => n !== null);
            const best = scores.length ? Math.max(...scores) : null;
            return (
              <li key={a.id}>
                <Link to={`/attempts/${a.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-surface-2">
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium text-fg">Attempt {attempts.length - i}</div>
                    <div className="text-xs text-muted">
                      {a.submissions.length ? plural(a.submissions.length, 'submission') : 'Draft'} · updated {timeAgo(a.updatedAt)}
                    </div>
                  </div>
                  <ScorePill score={best} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function ProblemSkeleton() {
  return (
    <PageContainer>
      <Skeleton className="mb-6 h-4 w-28" />
      <Skeleton className="mb-3 h-5 w-48" />
      <Skeleton className="mb-2 h-8 w-72" />
      <Skeleton className="mb-8 h-5 w-[480px] max-w-full" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
        <Skeleton className="h-96 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    </PageContainer>
  );
}
