import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { CRITERIA } from '@blueprint/shared';
import { Activity, ArrowRight, BarChart3, ChevronRight } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { api, queryKeys } from '@/api/client';
import { PageContainer } from '@/components/app-shell';
import { ErrorView } from '@/components/error-view';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { EmptyState, Skeleton } from '@/components/ui/misc';
import { ScorePill } from '@/components/ui/score';
import { CriterionBars, ScoreTrend } from '@/features/progress/charts';
import { SubmissionStatusBadge } from '@/features/workspace/sidebar';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { timeAgo } from '@/lib/format';

export function ProgressPage() {
  useDocumentTitle('Progress');
  const navigate = useNavigate();
  const { data, error, isLoading, refetch } = useQuery({ queryKey: queryKeys.progress, queryFn: api.progress });

  if (error) return <ErrorView error={error} onRetry={() => void refetch()} />;

  const [problemFilter, setProblemFilter] = useState('all');
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
