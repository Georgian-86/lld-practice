import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { api, queryKeys } from '@/api/client';

export function useStartAttempt() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (problemId: string) => api.startAttempt(problemId),
    onSuccess: (attempt) => {
      queryClient.setQueryData(queryKeys.attempt(attempt.id), attempt);
      void queryClient.invalidateQueries({ queryKey: queryKeys.problems });
      void queryClient.invalidateQueries({ queryKey: ['attempts'] });
      navigate(`/attempts/${attempt.id}`);
    },
    onError: (error) => toast.error('Could not start an attempt', { description: error.message }),
  });
}
