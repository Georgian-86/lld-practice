import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { Toaster } from 'sonner';
import { ApiError } from './api/client';
import { AppShell } from './components/app-shell';
import { RouteErrorBoundary } from './components/error-view';
import { TooltipProvider } from './components/ui/tooltip';
import { NotFoundPage } from './pages/not-found-page';
import { ProblemsPage } from './pages/problems-page';
// Fonts are self-hosted: no third-party requests, works offline and behind strict proxies.
import '@fontsource-variable/inter';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
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
      // Route-level code splitting keeps the first load small; each page loads on demand.
      { path: 'problems/:problemId', lazy: async () => ({ Component: (await import('./pages/problem-page')).ProblemPage }) },
      { path: 'attempts/:attemptId', lazy: async () => ({ Component: (await import('./pages/workspace-page')).WorkspacePage }) },
      { path: 'submissions/:submissionId', lazy: async () => ({ Component: (await import('./pages/submission-page')).SubmissionPage }) },
      { path: 'compare', lazy: async () => ({ Component: (await import('./pages/compare-page')).ComparePage }) },
      { path: 'progress', lazy: async () => ({ Component: (await import('./pages/progress-page')).ProgressPage }) },
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
