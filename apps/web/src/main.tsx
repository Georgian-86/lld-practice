import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { Toaster } from 'sonner';
import { ApiError } from './api/client';
import { AppShell } from './components/app-shell';
import { RouteErrorBoundary } from './components/error-view';
import { TooltipProvider } from './components/ui/tooltip';
import { ComparePage } from './pages/compare-page';
import { NotFoundPage } from './pages/not-found-page';
import { ProblemPage } from './pages/problem-page';
import { ProblemsPage } from './pages/problems-page';
import { ProgressPage } from './pages/progress-page';
import { SubmissionPage } from './pages/submission-page';
import { WorkspacePage } from './pages/workspace-page';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: false,
      // Don't retry "not found" / validation errors; do retry flaky network.
      retry: (count, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
    },
  },
  queryCache: new QueryCache(),
  mutationCache: new MutationCache(),
});

const router = createBrowserRouter([
  {
    element: <AppShell />,
    errorElement: <RouteErrorBoundary />,
    children: [
      { index: true, element: <ProblemsPage /> },
      { path: 'problems/:problemId', element: <ProblemPage /> },
      { path: 'attempts/:attemptId', element: <WorkspacePage /> },
      { path: 'submissions/:submissionId', element: <SubmissionPage /> },
      { path: 'compare', element: <ComparePage /> },
      { path: 'progress', element: <ProgressPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <RouterProvider router={router} />
        <Toaster position="bottom-right" richColors closeButton toastOptions={{ className: 'font-sans' }} />
      </TooltipProvider>
    </QueryClientProvider>
  </StrictMode>,
);
