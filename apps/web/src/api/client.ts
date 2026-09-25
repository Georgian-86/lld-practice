import type {
  AdaptiveCurveballDTO,
  ApiErrorBody,
  AttemptDTO,
  ComparisonDTO,
  DesignModel,
  Draft,
  Finding,
  HintDTO,
  ProblemDTO,
  ProblemSummaryDTO,
  ProgressDTO,
  SubmissionDTO,
} from '@blueprint/shared';
import { learnerId } from '@/lib/learner';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isNetwork() {
    return this.status === 0;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...init,
      headers: {
        'x-learner-id': learnerId(),
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError(0, 'network_error', 'Could not reach the server. Check your connection and try again.');
  }
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON body (e.g. proxy error page) */
  }
  if (!response.ok) {
    const error = (body as ApiErrorBody | null)?.error;
    throw new ApiError(
      response.status,
      error?.code ?? 'http_error',
      error?.message ?? `Request failed (${response.status}).`,
      error?.details,
    );
  }
  return body as T;
}

const json = (data: unknown) => JSON.stringify(data);

export const api = {
  health: () => request<{ status: string; aiReviewer: string; pendingEvaluations: number }>('/health'),
  problems: () => request<ProblemSummaryDTO[]>('/problems'),
  problem: (id: string) => request<ProblemDTO>(`/problems/${encodeURIComponent(id)}`),
  progress: () => request<ProgressDTO>('/progress'),
  attempts: (problemId?: string) =>
    request<AttemptDTO[]>(`/attempts${problemId ? `?problemId=${encodeURIComponent(problemId)}` : ''}`),
  attempt: (id: string) => request<AttemptDTO>(`/attempts/${encodeURIComponent(id)}`),
  startSample: (problemId: string) =>
    request<SubmissionDTO>(`/problems/${encodeURIComponent(problemId)}/sample`, { method: 'POST' }),
  startAttempt: (problemId: string) => request<AttemptDTO>('/attempts', { method: 'POST', body: json({ problemId }) }),
  saveDraft: (attemptId: string, draft: Draft, keepalive = false) =>
    request<{ savedAt: string }>(`/attempts/${encodeURIComponent(attemptId)}/draft`, {
      method: 'PUT',
      body: json({ draft }),
      keepalive,
    }),
  revealHint: (attemptId: string, level: number) =>
    request<HintDTO>(`/attempts/${encodeURIComponent(attemptId)}/hints`, { method: 'POST', body: json({ level }) }),
  submit: (attemptId: string, draft: Draft) =>
    request<SubmissionDTO>(`/attempts/${encodeURIComponent(attemptId)}/submissions`, {
      method: 'POST',
      body: json({ draft }),
    }),
  submission: (id: string) => request<SubmissionDTO>(`/submissions/${encodeURIComponent(id)}`),
  adaptiveCurveball: (submissionId: string) =>
    request<AdaptiveCurveballDTO>(`/submissions/${encodeURIComponent(submissionId)}/curveball`, { method: 'POST' }),
  retry: (id: string) => request<SubmissionDTO>(`/submissions/${encodeURIComponent(id)}/retry`, { method: 'POST' }),
  lint: (problemId: string, design: DesignModel) =>
    request<{ findings: Finding[] }>('/lint', { method: 'POST', body: json({ problemId, design }) }),
  compare: (base: string, target: string) =>
    request<ComparisonDTO>(`/compare?base=${encodeURIComponent(base)}&target=${encodeURIComponent(target)}`),
};

export const queryKeys = {
  health: ['health'] as const,
  problems: ['problems'] as const,
  problem: (id: string) => ['problem', id] as const,
  progress: ['progress'] as const,
  attempts: (problemId?: string) => ['attempts', problemId ?? 'all'] as const,
  attempt: (id: string) => ['attempt', id] as const,
  submission: (id: string) => ['submission', id] as const,
  compare: (a: string, b: string) => ['compare', a, b] as const,
};
