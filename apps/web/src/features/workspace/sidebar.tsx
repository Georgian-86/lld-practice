import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AttemptDTO, DesignModel, ProblemDTO, SubmissionSummaryDTO } from '@blueprint/shared';
import { isTerminal } from '@blueprint/shared';
import { CheckCircle2, ChevronRight, Circle, Eye, Lock } from 'lucide-react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { api, queryKeys } from '@/api/client';
import { Markdown } from '@/components/markdown';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SectionTitle } from '@/components/ui/misc';
import { ScorePill } from '@/components/ui/score';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/cn';
import { timeAgo } from '@/lib/format';
import { isMapped } from './draft-reducer';

export function WorkspaceSidebar({ problem, attempt, design }: { problem: ProblemDTO; attempt: AttemptDTO; design: DesignModel }) {
  return (
    <Tabs defaultValue="brief" className="flex min-h-0 flex-1 flex-col">
      <TabsList className="shrink-0 border-b border-border px-2">
        <TabsTrigger value="brief">Brief</TabsTrigger>
        <TabsTrigger value="requirements">Requirements</TabsTrigger>
        <TabsTrigger value="hints">
          Hints
          {attempt.revealedHints.length > 0 && (
            <span className="rounded bg-surface-2 px-1 text-[11px] tabular-nums text-muted">
              {attempt.revealedHints.length}/{problem.hints.length}
            </span>
          )}
        </TabsTrigger>
        <TabsTrigger value="versions">
          Versions
          {attempt.submissions.length > 0 && <span className="rounded bg-surface-2 px-1 text-[11px] tabular-nums text-muted">{attempt.submissions.length}</span>}
        </TabsTrigger>
      </TabsList>
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        <TabsContent value="brief" className="p-5 outline-none">
          <Markdown source={problem.description} className="text-[13px] leading-relaxed text-fg-2" />
          {problem.constraints.length > 0 && (
            <>
              <SectionTitle className="mb-2 mt-5">Constraints & scope</SectionTitle>
              <ul className="list-disc space-y-1 pl-4 text-[13px] text-muted marker:text-subtle">
                {problem.constraints.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </>
          )}
          <SectionTitle className="mb-2 mt-5">Likely points of change</SectionTitle>
          <ul className="space-y-2">
            {problem.variationPoints.map((v) => (
              <li key={v.id} className="rounded-lg bg-surface-2 px-3 py-2 text-[13px]">
                <div className="font-medium text-fg">{v.name}</div>
                <div className="text-xs text-muted">{v.description}</div>
              </li>
            ))}
          </ul>
        </TabsContent>
        <TabsContent value="requirements" className="p-5 outline-none">
          <RequirementList title="Functional" items={problem.functionalRequirements} design={design} />
          <RequirementList title="Non-functional" items={problem.nonFunctionalRequirements} design={design} className="mt-5" />
        </TabsContent>
        <TabsContent value="hints" className="p-5 outline-none">
          <Hints problem={problem} attempt={attempt} />
        </TabsContent>
        <TabsContent value="versions" className="p-5 outline-none">
          <Versions submissions={attempt.submissions} />
        </TabsContent>
      </div>
    </Tabs>
  );
}

function RequirementList({ title, items, design, className }: { title: string; items: ProblemDTO['functionalRequirements']; design: DesignModel; className?: string }) {
  if (!items.length) return null;
  return (
    <div className={className}>
      <SectionTitle className="mb-2">{title}</SectionTitle>
      <ul className="space-y-2.5">
        {items.map((r) => {
          const done = isMapped(design, r.id);
          return (
            <li key={r.id} className="flex gap-2.5 text-[13px] leading-relaxed">
              {done ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-label="Mapped" /> : <Circle className="mt-0.5 size-4 shrink-0 text-subtle" aria-label="Not mapped" />}
              <span className="text-fg-2">
                <span className="mr-1.5 font-mono text-[11px] font-medium text-muted">{r.id}</span>
                {r.text}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Hints({ problem, attempt }: { problem: ProblemDTO; attempt: AttemptDTO }) {
  const queryClient = useQueryClient();
  const reveal = useMutation({
    mutationFn: (level: number) => api.revealHint(attempt.id, level),
    onSuccess: (hint) => {
      queryClient.setQueryData<AttemptDTO>(queryKeys.attempt(attempt.id), (prev) =>
        prev ? { ...prev, revealedHints: [...prev.revealedHints.filter((h) => h.level !== hint.level), hint].sort((a, b) => a.level - b.level) } : prev,
      );
    },
    onError: (e) => toast.error('Could not reveal the hint', { description: e.message }),
  });
  const revealed = new Map(attempt.revealedHints.map((h) => [h.level, h]));
  const nextLevel = problem.hints.find((h) => !revealed.has(h.level))?.level;

  return (
    <div>
      <p className="mb-4 text-xs leading-relaxed text-muted">
        Stuck? Hints go from gentle to specific. The number of hints you used is shown on your feedback, so try on your own first.
      </p>
      <ol className="space-y-3">
        {problem.hints.map((h) => {
          const shown = revealed.get(h.level);
          const isNext = h.level === nextLevel;
          return (
            <li key={h.level} className={cn('rounded-xl border p-3.5', shown ? 'border-warning/30 bg-warning-soft/50' : 'border-border bg-surface')}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-medium text-fg">
                  <span className="mr-1.5 text-muted">Hint {h.level}</span>
                  {shown || isNext ? h.title : ''}
                </span>
                {!shown && !isNext && <Lock className="size-3.5 text-subtle" aria-label="Locked" />}
              </div>
              {shown ? (
                <p className="mt-2 text-[13px] leading-relaxed text-fg-2">{shown.text}</p>
              ) : isNext ? (
                <Button className="mt-2.5" size="sm" icon={<Eye className="size-3.5" />} onClick={() => reveal.mutate(h.level)} loading={reveal.isPending}>
                  Reveal hint
                </Button>
              ) : (
                <p className="mt-1 text-xs text-subtle">Reveal hint {h.level - 1} first.</p>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

const STATUS: Record<SubmissionSummaryDTO['status'], { label: string; tone: 'neutral' | 'primary' | 'success' | 'warning' | 'danger' }> = {
  submitted: { label: 'Queued', tone: 'neutral' },
  evaluating: { label: 'Evaluating', tone: 'primary' },
  evaluated: { label: 'Reviewed', tone: 'success' },
  evaluated_partial: { label: 'Partial', tone: 'warning' },
  failed: { label: 'Failed', tone: 'danger' },
};

export function SubmissionStatusBadge({ status }: { status: SubmissionSummaryDTO['status'] }) {
  return <Badge tone={STATUS[status].tone}>{STATUS[status].label}</Badge>;
}

function Versions({ submissions }: { submissions: SubmissionSummaryDTO[] }) {
  if (!submissions.length) {
    return <p className="text-[13px] text-muted">No submissions yet. Each time you submit, a new version is saved here with its feedback.</p>;
  }
  return (
    <ul className="-mx-2 space-y-1">
      {[...submissions].reverse().map((s) => (
        <li key={s.id}>
          <Link to={`/submissions/${s.id}`} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface-2">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-xs font-semibold text-fg-2">v{s.version}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <SubmissionStatusBadge status={s.status} />
                {!isTerminal(s.status) && <span className="size-1.5 animate-pulse rounded-full bg-primary" />}
              </div>
              <div className="mt-0.5 text-xs text-muted">{timeAgo(s.submittedAt)}</div>
            </div>
            <ScorePill score={s.overallScore} />
            <ChevronRight className="size-4 text-subtle" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
