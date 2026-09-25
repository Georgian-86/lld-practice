import { useQuery } from '@tanstack/react-query';
import type { Finding } from '@blueprint/shared';
import { ArrowRight, CheckCircle2, ChevronLeft, CircleDot, PlusCircle, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { api, queryKeys } from '@/api/client';
import { PageContainer } from '@/components/app-shell';
import { ErrorView } from '@/components/error-view';
import { Card, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/misc';
import { ScoreRing } from '@/components/ui/score';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { cn } from '@/lib/cn';
import { formatDateTime } from '@/lib/format';

function Delta({ value, className }: { value: number | null; className?: string }) {
  if (value === null) return <span className="text-subtle">—</span>;
  const tone = value > 0 ? 'text-success' : value < 0 ? 'text-danger' : 'text-muted';
  return <span className={cn('font-semibold tabular-nums', tone, className)}>{value > 0 ? `+${value}` : value === 0 ? '±0' : value}</span>;
}

export function ComparePage() {
  const [params] = useSearchParams();
  const base = params.get('base') ?? '';
  const target = params.get('target') ?? '';
  useDocumentTitle('Compare versions');
  const { data, error, refetch } = useQuery({
    queryKey: queryKeys.compare(base, target),
    queryFn: () => api.compare(base, target),
    enabled: Boolean(base && target),
  });

  if (!base || !target) return <ErrorView error={new Error('missing')} />;
  if (error) return <ErrorView error={error} onRetry={() => void refetch()} />;
  if (!data) {
    return (
      <PageContainer className="max-w-[1100px]">
        <Skeleton className="mb-6 h-8 w-64" />
        <Skeleton className="h-48 rounded-xl" />
      </PageContainer>
    );
  }

  return (
    <PageContainer className="max-w-[1100px]">
      <Link to={`/submissions/${data.target.id}`} className="mb-4 inline-flex items-center gap-1 text-[13px] text-muted hover:text-fg">
        <ChevronLeft className="size-4" /> Back to feedback
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">What changed between versions</h1>
      <p className="mt-1 text-[13px] text-muted">Findings are matched across versions, so you can see exactly what your revision fixed.</p>

      <Card className="mt-6 p-6">
        <div className="flex flex-col items-center justify-center gap-6 sm:flex-row sm:gap-10">
          <VersionScore label={`Version ${data.base.version}`} date={data.base.submittedAt} score={data.base.overallScore ?? 0} to={`/submissions/${data.base.id}`} />
          <div className="flex flex-col items-center">
            <ArrowRight className="size-5 text-subtle" />
            <Delta value={data.scoreDelta} className="mt-1 text-lg" />
          </div>
          <VersionScore label={`Version ${data.target.version}`} date={data.target.submittedAt} score={data.target.overallScore ?? 0} to={`/submissions/${data.target.id}`} />
        </div>
      </Card>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.4fr]">
        <Card className="self-start">
          <CardHeader title="By criterion" />
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border text-xs text-muted">
                <th className="px-5 py-2 text-left font-medium">Criterion</th>
                <th className="px-2 py-2 text-right font-medium">v{data.base.version}</th>
                <th className="px-2 py-2 text-right font-medium">v{data.target.version}</th>
                <th className="px-5 py-2 text-right font-medium">Change</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.criteria.map((c) => (
                <tr key={c.criterionId}>
                  <td className="px-5 py-2.5 text-fg-2">{c.name}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-muted">{c.base ?? '—'}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-fg">{c.target ?? '—'}</td>
                  <td className="px-5 py-2.5 text-right">
                    <Delta value={c.delta} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <div className="space-y-4">
          <FindingGroup
            title="Fixed"
            icon={<CheckCircle2 className="size-4 text-success" />}
            findings={data.resolved}
            empty="No issues from the earlier version were resolved."
          />
          <FindingGroup title="New strengths" icon={<Sparkles className="size-4 text-success" />} findings={data.newStrengths} empty="No new strengths." />
          <FindingGroup title="Still open" icon={<CircleDot className="size-4 text-warning" />} findings={data.persisting} empty="Nothing carried over." />
          <FindingGroup title="New issues" icon={<PlusCircle className="size-4 text-danger" />} findings={data.introduced} empty="No new issues introduced." />
        </div>
      </div>
    </PageContainer>
  );
}

function VersionScore({ label, date, score, to }: { label: string; date: string; score: number; to: string }) {
  return (
    <Link to={to} className="flex flex-col items-center rounded-xl p-2 hover:bg-surface-2">
      <ScoreRing score={score} size={96} stroke={9} />
      <div className="mt-2 text-[13px] font-semibold text-fg">{label}</div>
      <div className="text-xs text-muted">{formatDateTime(date)}</div>
    </Link>
  );
}

function FindingGroup({ title, icon, findings, empty }: { title: string; icon: ReactNode; findings: Finding[]; empty: string }) {
  return (
    <Card>
      <div className="flex items-center gap-2 border-b border-border px-5 py-3">
        {icon}
        <h2 className="text-[14px] font-semibold text-fg">{title}</h2>
        <span className="ml-auto rounded-md bg-surface-2 px-1.5 text-xs tabular-nums text-muted">{findings.length}</span>
      </div>
      {findings.length === 0 ? (
        <p className="px-5 py-3 text-[13px] text-muted">{empty}</p>
      ) : (
        <ul className="divide-y divide-border">
          {findings.map((f) => (
            <li key={`${f.source}-${f.fingerprint}`} className="px-5 py-3">
              <div className="text-[13px] font-medium text-fg">{f.title}</div>
              <div className="mt-0.5 line-clamp-2 text-xs text-muted">{f.message}</div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
