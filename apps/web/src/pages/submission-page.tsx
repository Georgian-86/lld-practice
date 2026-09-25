import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ProblemDTO, SubmissionDTO, SubmissionSummaryDTO } from '@blueprint/shared';
import { isTerminal } from '@blueprint/shared';
import { AlertTriangle, ChevronRight, GitCompareArrows, PencilLine, RefreshCw, XCircle } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { api, queryKeys } from '@/api/client';
import { PageContainer } from '@/components/app-shell';
import { ErrorView } from '@/components/error-view';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/misc';
import { EvaluationProgress } from '@/features/feedback/evaluation-progress';
import { FeedbackReport } from '@/features/feedback/feedback-report';
import { useAchievementToasts } from '@/features/progress/use-achievement-toasts';
import { SubmissionStatusBadge } from '@/features/workspace/sidebar';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { formatDateTime } from '@/lib/format';

export function SubmissionPage() {
  const { submissionId = '' } = useParams();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.submission(submissionId),
    queryFn: () => api.submission(submissionId),
    refetchInterval: (q) => q.state.data?.pollAfterMs ?? false,
    refetchIntervalInBackground: false,
  });
  const submission = query.data;
  const problem = useQuery({
    queryKey: queryKeys.problem(submission?.problemId ?? ''),
    queryFn: () => api.problem(submission!.problemId),
    enabled: Boolean(submission),
    staleTime: Infinity,
  });
  const attempt = useQuery({
    queryKey: queryKeys.attempt(submission?.attemptId ?? ''),
    queryFn: () => api.attempt(submission!.attemptId),
    enabled: Boolean(submission),
  });
  useDocumentTitle(problem.data && submission ? `${problem.data.title} · Feedback v${submission.version}` : 'Feedback');

  // When evaluation settles, refresh the lists that show scores.
  const settled = submission ? isTerminal(submission.status) : false;
  const wasSettled = useRef(settled);
  useEffect(() => {
    if (settled && !wasSettled.current) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.attempt(submission!.attemptId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.problems });
      void queryClient.invalidateQueries({ queryKey: queryKeys.progress });
      void queryClient.invalidateQueries({ queryKey: ['attempts'] });
    }
    wasSettled.current = settled;
  }, [settled, submission, queryClient]);

  useAchievementToasts(settled && Boolean(submission?.evaluation));

  const retry = useMutation({
    mutationFn: () => api.retry(submissionId),
    onSuccess: (updated) => queryClient.setQueryData(queryKeys.submission(submissionId), updated),
    onError: (e) => toast.error('Could not retry', { description: e.message }),
  });

  if (query.error) return <ErrorView error={query.error} onRetry={() => void query.refetch()} />;
  if (!submission) return <ReportSkeleton />;

  const previous = attempt.data?.submissions.filter((s) => s.version < submission.version && s.overallScore !== null).at(-1);

  return (
    <PageContainer className="max-w-[1100px]">
      <nav className="mb-4 flex items-center gap-1.5 text-[13px]" aria-label="Breadcrumb">
        <Link to="/" className="text-muted hover:text-fg">
          Problems
        </Link>
        <ChevronRight className="size-3.5 text-subtle" />
        {problem.data ? (
          <Link to={`/problems/${problem.data.id}`} className="text-muted hover:text-fg">
            {problem.data.title}
          </Link>
        ) : (
          <Skeleton className="h-4 w-24" />
        )}
        <ChevronRight className="size-3.5 text-subtle" />
        <span className="font-medium text-fg">Feedback</span>
      </nav>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight">Version {submission.version}</h1>
            <SubmissionStatusBadge status={submission.status} />
          </div>
          <p className="mt-1 text-[13px] text-muted">Submitted {formatDateTime(submission.submittedAt)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {previous && settled && submission.evaluation && (
            <Link to={`/compare?base=${previous.id}&target=${submission.id}`}>
              <Button icon={<GitCompareArrows className="size-4" />}>Compare with v{previous.version}</Button>
            </Link>
          )}
          <Link to={`/attempts/${submission.attemptId}`}>
            <Button variant={settled ? 'primary' : 'secondary'} icon={<PencilLine className="size-4" />}>
              {settled ? 'Revise design' : 'Back to editor'}
            </Button>
          </Link>
        </div>
      </div>

      <Body
        submission={submission}
        previous={previous}
        problem={problem.data}
        isLatest={attempt.data?.submissions.at(-1)?.id === submission.id}
        attemptSubmissions={attempt.data?.submissions}
        onRetry={() => retry.mutate()} retrying={retry.isPending} />
    </PageContainer>
  );
}

function Body({
  submission,
  previous,
  problem,
  isLatest,
  attemptSubmissions,
  onRetry,
  retrying,
}: {
  isLatest: boolean;
  attemptSubmissions?: SubmissionSummaryDTO[];
  submission: SubmissionDTO;
  previous?: SubmissionSummaryDTO;
  problem?: ProblemDTO;
  onRetry: () => void;
  retrying: boolean;
}) {
  if (!isTerminal(submission.status)) return <EvaluationProgress submission={submission} />;

  if (submission.status === 'failed' && !submission.evaluation) {
    return (
      <Card className="mx-auto max-w-xl p-8 text-center">
        <div className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-danger-soft text-danger">
          <XCircle className="size-6" />
        </div>
        <h2 className="text-lg font-semibold">We couldn’t evaluate this version</h2>
        <p className="mt-1 text-[13px] text-muted">{submission.statusMessage ?? 'Something went wrong while evaluating.'} Your design is saved.</p>
        <Button className="mt-5" variant="primary" icon={<RefreshCw className="size-4" />} onClick={onRetry} loading={retrying}>
          Try again
        </Button>
      </Card>
    );
  }

  const report = submission.evaluation!;
  return (
    <div className="space-y-6">
      {(submission.status === 'evaluated_partial' || submission.status === 'failed') && (
        <div className="flex flex-col gap-3 rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 sm:flex-row sm:items-center">
          <AlertTriangle className="size-5 shrink-0 text-warning" />
          <div className="flex-1 text-[13px] text-warning-soft-fg">
            <span className="font-semibold">The AI review didn’t complete</span> — this report is based on the deterministic design checks only. Scores may
            change once the AI review runs.
          </div>
          <Button size="sm" onClick={onRetry} loading={retrying} icon={<RefreshCw className="size-3.5" />}>
            Retry AI review
          </Button>
        </div>
      )}
      <FeedbackReport submission={submission} report={report} previous={previous} problem={problem} isLatest={isLatest} attemptSubmissions={attemptSubmissions} />
    </div>
  );
}

function ReportSkeleton() {
  return (
    <PageContainer className="max-w-[1100px]">
      <Skeleton className="mb-4 h-4 w-60" />
      <Skeleton className="mb-6 h-8 w-48" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
      <Skeleton className="mt-6 h-32 rounded-xl" />
    </PageContainer>
  );
}
