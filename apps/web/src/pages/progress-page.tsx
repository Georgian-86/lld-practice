import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { ProblemSummaryDTO, ProgressDTO } from '@blueprint/shared';
import { CRITERIA } from '@blueprint/shared';
import { Activity, ArrowRight, BarChart3, ChevronRight, Target } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { api, queryKeys } from '@/api/client';
import { PageContainer } from '@/components/app-shell';
import { ErrorView } from '@/components/error-view';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { EmptyState, Skeleton } from '@/components/ui/misc';
import { ScorePill } from '@/components/ui/score';
import { Achievements } from '@/features/progress/achievements';
import { CriterionBars, ScoreTrend } from '@/features/progress/charts';
import { SubmissionStatusBadge } from '@/features/workspace/sidebar';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { timeAgo } from '@/lib/format';

export function ProgressPage() {
  useDocumentTitle('Progress');
  const navigate = useNavigate();
  const { data, error, isLoading, refetch } = useQuery({ queryKey: queryKeys.progress, queryFn: api.progress });
  const problems = useQuery({ queryKey: queryKeys.problems, queryFn: api.problems });
  const recommendation = recommendNext(data, problems.data);

  const [problemFilter, setProblemFilter] = useState('all');
  if (error) return <ErrorView error={error} onRetry={() => void refetch()} />;

  const practicedProblems = [...new Map((data?.recent ?? []).map((s) => [s.problemId, s.problemTitle])).entries()];
  const scored = (data?.recent ?? [])
    .filter((s) => s.overallScore !== null && (problemFilter === 'all' || s.problemId === problemFilter))
    .reverse();
  const tiles = [
    { label: 'Problems practiced', value: data?.totals.problemsPracticed },
    { label: 'Submissions', value: data?.totals.submissions },
    { label: 'Average score', value: data?.totals.averageScore ?? '—' },
    { label: 'Best score', value: data?.totals.bestScore ?? '—' },
  ];

  return (
    <PageContainer>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Your progress</h1>
        <p className="mt-1 text-[13px] text-muted">Every submission is kept, so you can see which parts of your designs are improving.</p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tiles.map((t) => (
          <Card key={t.label} className="p-5">
            <div className="text-xs font-medium text-muted">{t.label}</div>
            {isLoading ? <Skeleton className="mt-2 h-8 w-16" /> : <div className="mt-1.5 text-[28px] font-semibold tabular-nums tracking-tight text-fg">{t.value}</div>}
          </Card>
        ))}
      </div>

      {!isLoading && data && data.totals.submissions === 0 ? (
        <Card>
          <EmptyState
            className="py-16"
            icon={<BarChart3 className="size-5" />}
            title="No feedback yet"
            description="Submit a design for review and your scores, strengths and weak spots will show up here."
            action={
              <Link to="/">
                <Button variant="primary">
                  Pick a problem <ArrowRight className="size-4" />
                </Button>
              </Link>
            }
          />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[1.4fr_1fr]">
            <Card>
              <CardHeader
                title="Score over time"
                icon={<Activity className="size-4" />}
                description="Each point is one submission — click to open its feedback"
                actions={
                  practicedProblems.length > 1 ? (
                    <select
                      value={problemFilter}
                      onChange={(e) => setProblemFilter(e.target.value)}
                      className="field h-8 w-auto py-0 text-[13px]"
                      aria-label="Filter by problem"
                    >
                      <option value="all">All problems</option>
                      {practicedProblems.map(([id, title]) => (
                        <option key={id} value={id}>
                          {title}
                        </option>
                      ))}
                    </select>
                  ) : undefined
                }
              />
              <div className="p-5">
                {isLoading ? (
                  <Skeleton className="h-52" />
                ) : scored.length === 0 ? (
                  <p className="py-16 text-center text-[13px] text-muted">Scores appear once feedback is ready.</p>
                ) : (
                  <ScoreTrend
                    points={scored.map((s) => ({
                      id: s.id,
                      score: s.overallScore!,
                      label: s.problemTitle,
                      sublabel: `Version ${s.version} · ${timeAgo(s.submittedAt)}`,
                      date: s.submittedAt,
                    }))}
                    onSelect={(id) => navigate(`/submissions/${id}`)}
                  />
                )}
              </div>
              {recommendation && (
                <div className="border-t border-border p-5">
                  <div className="flex flex-col gap-3 rounded-xl bg-primary-soft p-4 sm:flex-row sm:items-center">
                    <Target className="size-5 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold uppercase tracking-wide text-primary-soft-fg">Practise next</div>
                      <p className="mt-0.5 text-[13px] leading-relaxed text-fg">
                        <span className="font-semibold">{recommendation.problem.title}</span> weights{' '}
                        <span className="font-medium">{recommendation.criterion.toLowerCase()}</span> at {recommendation.weight}% — your weakest
                        area so far ({recommendation.average}).
                      </p>
                    </div>
                    <Link to={`/problems/${recommendation.problem.id}`}>
                      <Button size="sm" variant="primary">
                        Open problem <ArrowRight className="size-3.5" />
                      </Button>
                    </Link>
                  </div>
                </div>
              )}
            </Card>
            <Card>
              <CardHeader title="Average by criterion" icon={<BarChart3 className="size-4" />} description="Where your designs are strongest and weakest" />
              <div className="p-5">
                {isLoading || !data ? (
                  <Skeleton className="h-52" />
                ) : (
                  <CriterionBars
                    rows={data.criterionAverages.map((c) => ({
                      id: c.criterionId,
                      name: c.name,
                      value: c.average,
                      hint: CRITERIA[c.criterionId].description,
                    }))}
                  />
                )}
              </div>
            </Card>
          </div>

          {data && data.achievements.length > 0 && <Achievements achievements={data.achievements} />}

          <Card className="mt-6 overflow-hidden">
            <CardHeader title="Recent submissions" />
            {isLoading || !data ? (
              <div className="space-y-2 p-5">
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[13px]">
                  <thead>
                    <tr className="border-b border-border text-xs text-muted">
                      <th className="px-5 py-2.5 font-medium">Problem</th>
                      <th className="px-3 py-2.5 font-medium">Version</th>
                      <th className="px-3 py-2.5 font-medium">Status</th>
                      <th className="px-3 py-2.5 font-medium">Submitted</th>
                      <th className="px-3 py-2.5 text-right font-medium">Score</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.recent.map((s) => (
                      <tr key={s.id} className="cursor-pointer hover:bg-surface-2" onClick={() => navigate(`/submissions/${s.id}`)}>
                        <td className="px-5 py-3 font-medium text-fg">
                          <Link to={`/submissions/${s.id}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>
                            {s.problemTitle}
                          </Link>
                        </td>
                        <td className="px-3 py-3 tabular-nums text-fg-2">v{s.version}</td>
                        <td className="px-3 py-3">
                          <SubmissionStatusBadge status={s.status} />
                        </td>
                        <td className="px-3 py-3 text-muted">{timeAgo(s.submittedAt)}</td>
                        <td className="px-3 py-3 text-right">
                          <ScorePill score={s.overallScore} />
                        </td>
                        <td className="pr-4 text-subtle">
                          <ChevronRight className="size-4" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </PageContainer>
  );
}

/**
 * Suggest the problem that exercises the learner's weakest criterion most,
 * preferring problems they haven't practised yet.
 */
function recommendNext(progress?: ProgressDTO, problems?: ProblemSummaryDTO[]) {
  if (!progress || !problems?.length) return null;
  const weakest = progress.criterionAverages
    .filter((c): c is typeof c & { average: number } => c.average !== null)
    .sort((a, b) => a.average - b.average)[0];
  if (!weakest || weakest.average >= 90) return null;
  const ranked = [...problems].sort(
    (a, b) =>
      Number(a.progress.submissions > 0) - Number(b.progress.submissions > 0) ||
      b.rubric[weakest.criterionId] - a.rubric[weakest.criterionId],
  );
  const problem = ranked[0]!;
  return { problem, criterion: weakest.name, weight: problem.rubric[weakest.criterionId], average: weakest.average };
}
