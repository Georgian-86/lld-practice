import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AttemptDTO, ProblemDTO } from '@blueprint/shared';
import { curveballFor, isTerminal } from '@blueprint/shared';
import { AlertCircle, AlertTriangle, BookOpen, CheckCircle2, ChevronRight, CloudOff, Keyboard, Loader2, Send, X, XCircle, Zap } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { api, ApiError, queryKeys } from '@/api/client';
import { ErrorView } from '@/components/error-view';
import { Button } from '@/components/ui/button';
import { Dialog, Sheet } from '@/components/ui/dialog';
import { Kbd } from '@/components/ui/misc';
import { Tooltip } from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/misc';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ImpactCounts, useImpact } from '@/features/feedback/change-impact';
import { DifficultyBadge } from '@/features/problems/difficulty';
import { readinessChecks, type Check } from '@/features/workspace/checklist';
import { ClassesPanel } from '@/features/workspace/classes-panel';
import { DesignCanvas } from '@/features/workspace/canvas/design-canvas';
import { useLiveChecks } from '@/features/workspace/canvas/use-live-checks';
import { DiagramPanel } from '@/features/workspace/diagram-panel';
import { isMapped } from '@/features/workspace/draft-reducer';
import { useDraftHistory } from '@/features/workspace/use-draft-history';
import { InterviewTimer } from '@/features/workspace/interview-timer';
import { PatternsPanel } from '@/features/workspace/patterns-panel';
import { ReasoningPanel } from '@/features/workspace/reasoning-panel';
import { RelationshipsPanel } from '@/features/workspace/relationships-panel';
import { WorkspaceSidebar } from '@/features/workspace/sidebar';
import { TraceabilityPanel } from '@/features/workspace/traceability-panel';
import { useAutosave, type SaveState } from '@/features/workspace/use-autosave';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { cn } from '@/lib/cn';
import { timeAgo } from '@/lib/format';

const TABS = ['canvas', 'classes', 'relationships', 'traceability', 'patterns', 'reasoning', 'mermaid'] as const;
type Tab = (typeof TABS)[number];

export function WorkspacePage() {
  const { attemptId = '' } = useParams();
  const attempt = useQuery({ queryKey: queryKeys.attempt(attemptId), queryFn: () => api.attempt(attemptId) });
  const problemId = attempt.data?.problemId;
  const problem = useQuery({
    queryKey: queryKeys.problem(problemId ?? ''),
    queryFn: () => api.problem(problemId!),
    enabled: Boolean(problemId),
    staleTime: Infinity,
  });
  useDocumentTitle(problem.data ? `${problem.data.title} · Workspace` : 'Workspace');

  const error = attempt.error ?? problem.error;
  if (error) return <ErrorView error={error} onRetry={() => void (attempt.error ? attempt.refetch() : problem.refetch())} />;
  if (!attempt.data || !problem.data) return <WorkspaceSkeleton />;
  return <Workspace key={attempt.data.id} attempt={attempt.data} problem={problem.data} />;
}

function Workspace({ attempt, problem }: { attempt: AttemptDTO; problem: ProblemDTO }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const tab: Tab = TABS.includes(params.get('tab') as Tab) ? (params.get('tab') as Tab) : 'canvas';
  // `focus` deep-links from feedback to a class or requirement; it is dropped on the next tab change.
  const focus = params.get('focus');
  const setTab = (next: string) =>
    setParams(
      (p) => {
        p.set('tab', next);
        p.delete('focus');
        return p;
      },
      { replace: true },
    );

  const { draft, dispatch, undo, redo, canUndo, canRedo } = useDraftHistory(attempt.draft);
  const design = draft.design;
  const autosave = useAutosave(attempt.id, draft);
  const liveChecks = useLiveChecks(problem.id, design, tab === 'canvas');

  // Curveball: accepted from a report (?curveball=<version>), active until a later version is submitted.
  const curveballParam = params.get('curveball');
  const curveballIdParam = params.get('cb');
  const timedParam = params.get('timed');
  useEffect(() => {
    if (!curveballParam && !timedParam) return;
    const fromVersion = Number(curveballParam);
    const curveballId = problem.curveballs.find((c) => c.id === curveballIdParam)?.id ?? problem.curveballs[0]!.id;
    if (
      curveballParam &&
      Number.isInteger(fromVersion) &&
      attempt.submissions.some((s) => s.version === fromVersion) &&
      (draft.challenge?.fromVersion !== fromVersion || draft.challenge?.curveballId !== curveballId)
    ) {
      dispatch({ type: 'challenge/set', challenge: { kind: 'curveball', fromVersion, curveballId, acceptedAt: new Date().toISOString() }, transient: true });
    }
    if (timedParam && !draft.timer) dispatch({ type: 'timer/set', timer: { startedAt: new Date().toISOString(), minutes: problem.estimatedMinutes }, transient: true });
    setParams(
      (p) => {
        p.delete('curveball');
        p.delete('cb');
        p.delete('timed');
        return p;
      },
      { replace: true },
    );
  }, [curveballParam, timedParam]);
  const challenge = draft.challenge;
  const curveballBase =
    challenge && !attempt.submissions.some((s) => s.version > challenge.fromVersion)
      ? attempt.submissions.find((s) => s.version === challenge.fromVersion)
      : undefined;
  const impact = useImpact(curveballBase?.id, design);
  const curveball = challenge ? curveballFor(problem.curveballs, challenge.curveballId) : undefined;
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [briefOpen, setBriefOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  // Keep the cached attempt in sync so navigating away and back never shows a stale draft.
  useEffect(() => {
    queryClient.setQueryData<AttemptDTO>(queryKeys.attempt(attempt.id), (prev) => (prev ? { ...prev, draft } : prev));
  }, [draft, attempt.id, queryClient]);

  const latest = attempt.submissions.at(-1);
  const pending = latest && !isTerminal(latest.status) ? latest : null;
  const checks = useMemo(() => readinessChecks(problem, design), [problem, design]);
  const blocked = checks.some((c) => c.level === 'block');

  const submit = useMutation({
    mutationFn: () => api.submit(attempt.id, draft),
    onSuccess: (submission) => {
      autosave.markSaved(draft);
      // A timed session ends with its submission.
      if (draft.timer) dispatch({ type: 'timer/set', timer: undefined, transient: true });
      queryClient.setQueryData(queryKeys.submission(submission.id), submission);
      void queryClient.invalidateQueries({ queryKey: queryKeys.attempt(attempt.id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.problems });
      void queryClient.invalidateQueries({ queryKey: queryKeys.progress });
      navigate(`/submissions/${submission.id}`);
    },
    onError: (error) => {
      setConfirmOpen(false);
      const details = error instanceof ApiError ? (error.details as { submissionId?: string } | undefined) : undefined;
      toast.error(error instanceof ApiError && error.code === 'duplicate_submission' ? 'No changes to submit' : 'Submission not accepted', {
        description: error.message,
        ...(details?.submissionId ? { action: { label: 'View', onClick: () => navigate(`/submissions/${details.submissionId}`) } } : {}),
      });
    },
  });

  // Keyboard: Ctrl/⌘+S saves now, Ctrl/⌘+Enter opens the submit dialog (or confirms it),
  // Ctrl/⌘+Z / Shift+Z / Y undo and redo design edits (text fields keep their own undo).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '?' && !(e.target as HTMLElement | null)?.closest('input, textarea, select, [contenteditable="true"]')) {
        e.preventDefault();
        setShortcutsOpen(true);
        return;
      }
      if (!(e.metaKey || e.ctrlKey)) return;
      const key = e.key.toLowerCase();
      if (key === 'z' || key === 'y') {
        const el = e.target as HTMLElement | null;
        if (el?.closest('input, textarea, select, [contenteditable="true"]') || document.querySelector('[role="dialog"]')) return;
        e.preventDefault();
        if (key === 'y' || e.shiftKey) redo();
        else undo();
        return;
      }
      if (e.key === 's') {
        e.preventDefault();
        void autosave.saveNow();
      } else if (e.key === 'Enter' && !pending) {
        e.preventDefault();
        if (!confirmOpen) setConfirmOpen(true);
        else if (!blocked && !submit.isPending) submit.mutate();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [autosave, pending, confirmOpen, blocked, submit, undo, redo]);

  const named = design.entities.filter((e) => e.name.trim()).length;
  const mapped = problem.functionalRequirements.filter((r) => isMapped(design, r.id)).length;
  const counts: Record<Tab, string | null> = {
    canvas: named ? String(named) : null,
    classes: null,
    relationships: design.relationships.length ? String(design.relationships.length) : null,
    traceability: `${mapped}/${problem.functionalRequirements.length}`,
    patterns: design.patterns.length ? String(design.patterns.length) : null,
    reasoning: null,
    mermaid: null,
  };

  return (
    <div className="flex h-[calc(100vh-3.5rem)] min-h-[560px] flex-col">
      {/* Toolbar */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-surface px-4 py-2.5 sm:px-5">
        <nav className="flex min-w-0 items-center gap-1.5 text-[13px]" aria-label="Breadcrumb">
          <Link to="/" className="text-muted hover:text-fg">
            Problems
          </Link>
          <ChevronRight className="size-3.5 text-subtle" />
          <Link to={`/problems/${problem.id}`} className="truncate font-medium text-fg hover:underline">
            {problem.title}
          </Link>
          <DifficultyBadge difficulty={problem.difficulty} />
          <span className="hidden text-xs text-muted sm:inline">· Draft v{(latest?.version ?? 0) + 1}</span>
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <Button size="sm" variant="ghost" className={cn(tab !== 'canvas' && 'lg:hidden')} icon={<BookOpen className="size-4" />} onClick={() => setBriefOpen(true)} aria-label="Brief & hints">
            <span className="hidden sm:inline">Brief & hints</span>
          </Button>
          <InterviewTimer
            timer={draft.timer}
            minutes={problem.estimatedMinutes}
            onStart={() => dispatch({ type: 'timer/set', timer: { startedAt: new Date().toISOString(), minutes: problem.estimatedMinutes }, transient: true })}
            onStop={() => dispatch({ type: 'timer/set', timer: undefined, transient: true })}
          />
          <Button size="icon" variant="ghost" className="hidden md:inline-flex" onClick={() => setShortcutsOpen(true)} aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)">
            <Keyboard className="size-4" />
          </Button>
          <SaveIndicator state={autosave.state} savedAt={autosave.savedAt} onRetry={() => void autosave.saveNow()} />
          <Tooltip
            content={
              pending ? (
                `Version ${pending.version} is still being evaluated`
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  Shortcut <Kbd>Ctrl</Kbd>+<Kbd>Enter</Kbd>
                </span>
              )
            }
            side="bottom"
          >
            <span className="inline-flex">
              <Button variant="primary" icon={<Send className="size-4" />} onClick={() => setConfirmOpen(true)} disabled={Boolean(pending)}>
                <span>
                  Submit<span className="hidden sm:inline"> for review</span>
                </span>
              </Button>
            </span>
          </Tooltip>
        </div>
      </div>

      {curveballBase && (
        <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-ai/25 bg-ai-soft px-4 py-2 text-[13px] text-ai-soft-fg sm:px-5" role="status">
          <span className="inline-flex items-center gap-1.5 font-semibold">
            <Zap className="size-4" /> Curveball{curveball ? `: ${curveball.title}` : ''}
          </span>
          <span className="min-w-0 flex-1 basis-80 text-fg-2">{curveball?.prompt}</span>
          {impact && (
            <span className="inline-flex items-center gap-2 text-xs text-muted">
              vs v{curveballBase.version}: <ImpactCounts impact={impact} />
            </span>
          )}
          <button
            type="button"
            onClick={() => dispatch({ type: 'challenge/set', challenge: undefined, transient: true })}
            className="rounded p-1 text-muted hover:bg-surface hover:text-fg"
            aria-label="Drop the curveball"
            title="Drop the curveball"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {pending && (
        <div className="flex shrink-0 items-center gap-2 border-b border-primary/20 bg-primary-soft px-5 py-2 text-[13px] text-primary-soft-fg">
          <Loader2 className="size-4 animate-spin" />
          Version {pending.version} is being reviewed. You can keep editing; submit again once its feedback is ready.
          <Link to={`/submissions/${pending.id}`} className="ml-auto font-medium underline-offset-2 hover:underline">
            View progress
          </Link>
        </div>
      )}

      <div className={cn('grid min-h-0 flex-1 grid-cols-1', tab !== 'canvas' && 'lg:grid-cols-[minmax(300px,360px)_1fr]')}>
        <aside className={cn('hidden min-h-0 flex-col border-r border-border bg-surface', tab !== 'canvas' && 'lg:flex')} aria-label="Problem">
          <WorkspaceSidebar problem={problem} attempt={attempt} design={design} />
        </aside>

        <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-col bg-bg">
          <TabsList className="shrink-0 border-b border-border bg-surface px-3">
            {TABS.map((t) => (
              <TabsTrigger key={t} value={t}>
                {TAB_LABELS[t]}
                {counts[t] && <span className="rounded bg-surface-2 px-1.5 text-[11px] tabular-nums text-muted">{counts[t]}</span>}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="canvas" className="flex min-h-0 flex-1 flex-col outline-none data-[state=inactive]:hidden">
            <DesignCanvas
              problem={problem}
              design={design}
              layout={draft.layout}
              dispatch={dispatch}
              history={{ undo, redo, canUndo, canRedo }}
              impact={impact}
              findings={liveChecks.findings}
              checking={liveChecks.checking}
              focus={tab === 'canvas' ? focus : null}
            />
          </TabsContent>
          <TabsContent value="classes" className="flex min-h-0 flex-1 flex-col bg-surface outline-none data-[state=inactive]:hidden">
            <ClassesPanel design={design} dispatch={dispatch} focus={tab === 'classes' ? focus : null} />
          </TabsContent>
          <TabsContent value="relationships" className="flex min-h-0 flex-1 flex-col outline-none data-[state=inactive]:hidden">
            <RelationshipsPanel design={design} dispatch={dispatch} />
          </TabsContent>
          <TabsContent value="traceability" className="flex min-h-0 flex-1 flex-col outline-none data-[state=inactive]:hidden">
            <TraceabilityPanel problem={problem} design={design} dispatch={dispatch} focus={tab === 'traceability' ? focus : null} />
          </TabsContent>
          <TabsContent value="patterns" className="flex min-h-0 flex-1 flex-col outline-none data-[state=inactive]:hidden">
            <PatternsPanel design={design} dispatch={dispatch} />
          </TabsContent>
          <TabsContent value="reasoning" className="flex min-h-0 flex-1 flex-col outline-none data-[state=inactive]:hidden">
            <ReasoningPanel problem={problem} design={design} dispatch={dispatch} />
          </TabsContent>
          <TabsContent value="mermaid" className="flex min-h-0 flex-1 flex-col outline-none data-[state=inactive]:hidden">
            <DiagramPanel design={design} dispatch={dispatch} />
          </TabsContent>
        </Tabs>
      </div>

      <Sheet open={briefOpen} onOpenChange={setBriefOpen} title={problem.title}>
        <WorkspaceSidebar problem={problem} attempt={attempt} design={design} />
      </Sheet>

      <SubmitDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        checks={checks}
        blocked={blocked}
        submitting={submit.isPending}
        onSubmit={() => submit.mutate()}
        onGoTo={(t) => {
          setConfirmOpen(false);
          setTab(t);
        }}
      />

      <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} title="Keyboard shortcuts" size="sm">
        <dl className="divide-y divide-border text-[13px]">
          {SHORTCUTS.map(([keys, action]) => (
            <div key={action} className="flex items-center justify-between gap-4 py-2">
              <dt className="text-fg-2">{action}</dt>
              <dd className="flex shrink-0 items-center gap-1">
                {keys.map((k, i) => (
                  <Kbd key={i}>{k}</Kbd>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </Dialog>
    </div>
  );
}

const SHORTCUTS: [string[], string][] = [
  [['Ctrl', 'Z'], 'Undo'],
  [['Ctrl', 'Shift', 'Z'], 'Redo'],
  [['Ctrl', 'S'], 'Save now'],
  [['Ctrl', 'Enter'], 'Submit for review'],
  [['Delete'], 'Delete the selected class or relationship'],
  [['Double-click'], 'Edit a class'],
  [['Shift', 'Drag'], 'Select several classes'],
  [['?'], 'Show this list'],
];

const TAB_LABELS: Record<Tab, string> = {
  canvas: 'Diagram',
  classes: 'Class list',
  relationships: 'Relationships',
  traceability: 'Traceability',
  patterns: 'Patterns',
  reasoning: 'Trade-offs & extension',
  mermaid: 'Mermaid',
};

function SaveIndicator({ state, savedAt, onRetry }: { state: SaveState; savedAt: Date | null; onRetry: () => void }) {
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  if (state === 'error') {
    return (
      <button type="button" onClick={onRetry} className="inline-flex items-center gap-1.5 text-xs font-medium text-danger hover:underline">
        <CloudOff className="size-3.5" /> Not saved — retry
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted" aria-live="polite">
      {state === 'saving' ? (
        <>
          <Loader2 className="size-3.5 animate-spin" /> <span className="hidden sm:inline">Saving…</span>
        </>
      ) : state === 'dirty' ? (
        <>
          <span className="size-1.5 rounded-full bg-warning" /> <span className="hidden sm:inline">Unsaved changes</span>
        </>
      ) : (
        <>
          <CheckCircle2 className="size-3.5 text-success" />
          <span className="hidden sm:inline">{savedAt ? `Saved ${timeAgo(savedAt.toISOString())}` : 'All changes saved'}</span>
        </>
      )}
    </span>
  );
}

function SubmitDialog({
  open,
  onOpenChange,
  checks,
  blocked,
  submitting,
  onSubmit,
  onGoTo,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  checks: Check[];
  blocked: boolean;
  submitting: boolean;
  onSubmit: () => void;
  onGoTo: (tab: Check['tab']) => void;
}) {
  const warnings = checks.filter((c) => c.level === 'warn').length;
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Submit for review?"
      description={
        blocked
          ? 'A few things must be fixed before this design can be evaluated.'
          : warnings
            ? 'You can submit now — the feedback will cover the gaps below — or fill them in first.'
            : 'Your design looks complete. Feedback usually takes a few seconds.'
      }
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Keep editing
          </Button>
          <Button variant="primary" onClick={onSubmit} disabled={blocked} loading={submitting} icon={<Send className="size-4" />}>
            Submit
          </Button>
        </>
      }
    >
      <ul className="divide-y divide-border rounded-xl border border-border">
        {checks.map((c) => (
          <li key={c.id} className="flex items-center gap-3 px-3.5 py-2.5">
            {c.level === 'ok' ? (
              <CheckCircle2 className="size-4 shrink-0 text-success" />
            ) : c.level === 'warn' ? (
              <AlertTriangle className="size-4 shrink-0 text-warning" />
            ) : (
              <XCircle className="size-4 shrink-0 text-danger" />
            )}
            <div className="min-w-0 flex-1">
              <div className={cn('text-[13px]', c.level === 'ok' ? 'text-fg-2' : 'font-medium text-fg')}>{c.label}</div>
              {c.detail && <div className="truncate text-xs text-muted">{c.detail}</div>}
            </div>
            {c.level !== 'ok' && (
              <button type="button" onClick={() => onGoTo(c.tab)} className="shrink-0 text-xs font-medium text-primary hover:underline">
                Fix
              </button>
            )}
          </li>
        ))}
      </ul>
      {!blocked && (
        <p className="mt-3 flex items-start gap-2 text-xs text-muted">
          <AlertCircle className="mt-px size-3.5 shrink-0" />
          Evaluation runs in the background. You can leave the page and come back — your feedback will be waiting.
        </p>
      )}
    </Dialog>
  );
}

function WorkspaceSkeleton() {
  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      <div className="flex items-center gap-3 border-b border-border bg-surface px-5 py-3">
        <Skeleton className="h-5 w-64" />
        <Skeleton className="ml-auto h-9 w-40" />
      </div>
      <div className="grid flex-1 grid-cols-1 lg:grid-cols-[360px_1fr]">
        <div className="hidden space-y-3 border-r border-border bg-surface p-5 lg:block">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-4/6" />
        </div>
        <div className="space-y-3 p-5">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    </div>
  );
}
