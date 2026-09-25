import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { api, queryKeys } from '@/api/client';

export function useStartAttempt() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ problemId }: { problemId: string; timed?: boolean }) => api.startAttempt(problemId),
    onSuccess: (attempt, { timed }) => {
      queryClient.setQueryData(queryKeys.attempt(attempt.id), attempt);
      void queryClient.invalidateQueries({ queryKey: queryKeys.problems });
      void queryClient.invalidateQueries({ queryKey: ['attempts'] });
      navigate(`/attempts/${attempt.id}${timed ? '?timed=1' : ''}`);
    },
    onError: (error) => toast.error('Could not start an attempt', { description: error.message }),
  });
}

/** Opens a worked sample as the learner's own attempt and goes straight to its report. */
export function useStartSample() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (problemId: string) => api.startSample(problemId),
    onSuccess: (submission) => {
      queryClient.setQueryData(queryKeys.submission(submission.id), submission);
      void queryClient.invalidateQueries({ queryKey: queryKeys.problems });
      void queryClient.invalidateQueries({ queryKey: ['attempts'] });
      navigate(`/submissions/${submission.id}`);
    },
    onError: (error) => toast.error('Could not open the sample', { description: error.message }),
  });
}
