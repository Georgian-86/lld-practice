import { useQuery } from '@tanstack/react-query';
import type { EvaluationReport, SubmissionDTO, SubmissionSummaryDTO } from '@blueprint/shared';
import { CRITERIA, GRADE_LABELS } from '@blueprint/shared';
import { ArrowRight, CheckCircle2, ChevronDown, Compass, GitCompareArrows, ListChecks, Sparkles, Wrench } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { api, queryKeys } from '@/api/client';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/misc';
import { Meter, ScoreRing, scoreTone } from '@/components/ui/score';
import { Tabs, TabsList, PillTrigger } from '@/components/ui/tabs';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/cn';
import { FindingCard } from './finding-card';

type Filter = 'improve' | 'strengths' | 'all';

export function isSimulated(report: EvaluationReport): boolean {
  return report.evaluators.some((e) => e.kind === 'llm' && e.detail?.startsWith('simulated'));
}

export function FeedbackReport({
  submission,
  report,
  previous,
}: {
  submission: SubmissionDTO;
  report: EvaluationReport;
  /** The latest earlier version with feedback, if any. */
  previous?: SubmissionSummaryDTO;
}) {
  const simulated = isSimulated(report);
  const toneText = { success: 'text-success', primary: 'text-primary', warning: 'text-warning', danger: 'text-danger' }[scoreTone(report.overallScore)];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.1fr_1fr]">
        <Card className="flex flex-col p-6">
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
            <ScoreRing score={report.overallScore} size={128} stroke={11} />
            <div className="min-w-0 flex-1 text-center sm:text-left">
              <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                <span className={cn('text-xl font-semibold tracking-tight', toneText)}>{GRADE_LABELS[report.grade]}</span>
                {report.completeness === 'partial' && <Badge tone="warning">Automated checks only</Badge>}
                {submission.hintsUsed > 0 && (
                  <Badge tone="neutral">
                    {submission.hintsUsed} hint{submission.hintsUsed === 1 ? '' : 's'} used
                  </Badge>
                )}
              </div>
              <p className="mt-2 text-[14px] leading-relaxed text-fg-2">{report.summary}</p>
            </div>
          </div>
          {report.nextStep && (
            <div className="mt-6 flex gap-3 rounded-xl border border-primary/20 bg-primary-soft px-4 py-3">
              <Compass className="mt-0.5 size-4 shrink-0 text-primary" />
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-primary-soft-fg">Focus for your next attempt</div>
                <p className="mt-0.5 text-[13px] leading-relaxed text-fg">{report.nextStep}</p>
              </div>
            </div>
          )}
          <TopStrengths report={report} />
          {previous && <SinceLastVersion previous={previous} current={submission} />}
        </Card>

        <Card>
          <CardHeader title="Rubric breakdown" icon={<ListChecks className="size-4" />} description="Weighted for this problem" />
          <ul className="divide-y divide-border">
            {report.criterionScores.map((c) => (
              <li key={c.criterionId} className="px-5 py-3">
                <div className="flex items-center justify-between gap-3">
                  <Tooltip content={CRITERIA[c.criterionId].description}>
                    <span className="text-[13px] font-medium text-fg">{c.name}</span>
                  </Tooltip>
                  <div className="flex items-center gap-2 text-xs text-muted">
                    <span className="tabular-nums">{c.weight}%</span>
                    <Tooltip
                      content={
                        <>
                          Rules: {c.ruleScore}
                          {c.aiScore !== null ? ` · AI: ${c.aiScore}` : ' · AI: n/a'}
                        </>
                      }
                    >
                      <span className="w-8 text-right text-[13px] font-semibold tabular-nums text-fg">{c.score}</span>
                    </Tooltip>
                  </div>
                </div>
                <Meter value={c.score} className="mt-2 h-1.5" />
                <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted">{c.rationale}</p>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Findings report={report} simulated={simulated} attemptId={submission.attemptId} />

      {report.alternatives.length > 0 && (
        <Card>
          <CardHeader
            title="Other valid approaches"
            icon={<GitCompareArrows className="size-4" />}
            description="LLD has more than one good answer. Here is when a different choice would be better."
          />
          <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2">
            {report.alternatives.map((a) => (
              <div key={a.title} className="rounded-xl border border-border bg-surface-2/60 p-4">
                <div className="text-[14px] font-semibold text-fg">{a.title}</div>
                <p className="mt-1 text-[13px] leading-relaxed text-fg-2">{a.description}</p>
                <p className="mt-2 text-xs leading-relaxed text-muted">
                  <span className="font-semibold text-fg-2">Better when: </span>
                  {a.whenBetter}
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}

      <HowEvaluated report={report} />
    </div>
  );
}

function TopStrengths({ report }: { report: EvaluationReport }) {
  const strengths = report.findings.filter((f) => f.kind === 'strength').slice(0, 3);
  if (strengths.length === 0) return null;
  return (
    <div className="mt-6">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">What you did well</div>
      <ul className="space-y-1.5">
        {strengths.map((s) => (
          <li key={`${s.source}-${s.fingerprint}`} className="flex items-start gap-2 text-[13px] text-fg-2">
            <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" />
            {s.title}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SinceLastVersion({ previous, current }: { previous: SubmissionSummaryDTO; current: SubmissionDTO }) {
  const { data } = useQuery({
    queryKey: queryKeys.compare(previous.id, current.id),
    queryFn: () => api.compare(previous.id, current.id),
  });
  const stats = data
    ? [
        { label: 'score', value: data.scoreDelta ?? 0, delta: true },
        { label: 'fixed', value: data.resolved.length },
        { label: 'new strengths', value: data.newStrengths.length },
        { label: 'new issues', value: data.introduced.length },
      ]
    : null;
  return (
    <div className="mt-auto pt-6">
      <div className="rounded-xl border border-border p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">Since version {previous.version}</span>
          <Link to={`/compare?base=${previous.id}&target=${current.id}`} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
            Full comparison <ArrowRight className="size-3" />
          </Link>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {(stats ?? Array.from({ length: 4 }, () => null)).map((s, i) => (
            <div key={s?.label ?? i} className="text-center">
              {s ? (
                <>
                  <div
                    className={cn(
                      'text-lg font-semibold tabular-nums',
                      s.delta ? (s.value > 0 ? 'text-success' : s.value < 0 ? 'text-danger' : 'text-muted') : 'text-fg',
                      s.label === 'new issues' && s.value > 0 && 'text-danger',
                    )}
                  >
                    {s.delta && s.value > 0 ? `+${s.value}` : s.value}
                  </div>
                  <div className="text-[11px] text-muted">{s.label}</div>
                </>
              ) : (
                <div className="skeleton mx-auto h-9 w-12" />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Findings({ report, simulated, attemptId }: { report: EvaluationReport; simulated: boolean; attemptId: string }) {
  const [filter, setFilter] = useState<Filter>('improve');
  const groups = useMemo(() => {
    const improve = report.findings.filter((f) => f.kind !== 'strength' && f.severity !== 'info');
    const strengths = report.findings.filter((f) => f.kind === 'strength');
    const notes = report.findings.filter((f) => f.kind !== 'strength' && f.severity === 'info');
    return { improve, strengths, notes };
  }, [report.findings]);

  const shown = filter === 'improve' ? groups.improve : filter === 'strengths' ? groups.strengths : report.findings;

  return (
    <section aria-labelledby="findings-heading">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="findings-heading" className="text-base font-semibold tracking-tight">
            Feedback
          </h2>
          <p className="text-[13px] text-muted">Most important first. Each point references your own classes and requirements.</p>
        </div>
        <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <TabsList className="rounded-lg bg-surface-2 p-1">
            <PillTrigger value="improve">To improve · {groups.improve.length}</PillTrigger>
            <PillTrigger value="strengths">Strengths · {groups.strengths.length}</PillTrigger>
            <PillTrigger value="all">All · {report.findings.length}</PillTrigger>
          </TabsList>
        </Tabs>
      </div>
      {shown.length === 0 ? (
        <Card>
          <EmptyState
            icon={<CheckCircle2 className="size-5" />}
            title={filter === 'strengths' ? 'No strengths recorded yet' : 'Nothing important to fix'}
            description={filter === 'strengths' ? 'Strengths appear as your design covers more of the rubric.' : 'Check the strengths and the notes below.'}
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {shown.map((f) => (
            <FindingCard key={`${f.source}-${f.fingerprint}`} finding={f} simulated={simulated} attemptId={attemptId} />
          ))}
        </div>
      )}
      {filter === 'improve' && groups.notes.length > 0 && <Notes notes={groups.notes} simulated={simulated} attemptId={attemptId} />}
    </section>
  );
}

function Notes({ notes, simulated, attemptId }: { notes: EvaluationReport['findings']; simulated: boolean; attemptId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-fg"
        aria-expanded={open}
      >
        <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} />
        {notes.length} optional {notes.length === 1 ? 'idea' : 'ideas'} to consider
      </button>
      {open && (
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          {notes.map((f) => (
            <FindingCard key={`${f.source}-${f.fingerprint}`} finding={f} simulated={simulated} attemptId={attemptId} compact />
          ))}
        </div>
      )}
    </div>
  );
}

function HowEvaluated({ report }: { report: EvaluationReport }) {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 text-[14px] font-semibold text-fg">
          <Wrench className="size-4 text-muted" /> How this feedback was produced
        </span>
        <ChevronDown className={cn('size-4 text-muted transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="border-t border-border px-5 py-4 text-[13px] leading-relaxed text-fg-2">
          <ol className="space-y-3">
            {report.evaluators.map((e) => (
              <li key={e.evaluatorId} className="flex items-start gap-3">
                <span className={cn('mt-0.5 grid size-6 shrink-0 place-items-center rounded-md', e.kind === 'llm' ? 'bg-ai-soft text-ai' : 'bg-surface-2 text-fg-2')}>
                  {e.kind === 'llm' ? <Sparkles className="size-3.5" /> : <Wrench className="size-3.5" />}
                </span>
                <div>
                  <div className="font-medium text-fg">
                    {e.kind === 'llm' ? 'AI reviewer' : 'Deterministic design checks'}
                    <Badge tone={e.status === 'ok' ? 'success' : e.status === 'failed' ? 'danger' : 'neutral'} className="ml-2">
                      {e.status === 'ok' ? `${(e.durationMs / 1000).toFixed(1)}s` : e.status}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted">
                    {e.detail}
                    {e.error ? ` — ${e.error}` : ''}
                  </div>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-4 rounded-lg bg-surface-2 px-4 py-3 text-xs leading-relaxed text-muted">
            <p>
              <span className="font-semibold text-fg-2">Scoring.</span> Each criterion starts from the rule checks (100 minus deductions per issue). When the AI review is
              available it contributes 60% of the criterion score, but it can raise a score at most 25 points above what the checks support, and any critical rule
              finding caps the criterion at 50. The overall score is weighted by this problem’s rubric.
            </p>
            <p className="mt-2">
              <span className="font-semibold text-fg-2">Why this is fair to different designs.</span> Checks look for properties (is every requirement owned? does the
              pricing policy sit behind an abstraction?), never for specific class names.
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}
