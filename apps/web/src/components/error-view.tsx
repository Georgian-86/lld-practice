import { AlertTriangle, RefreshCw } from 'lucide-react';
import { isRouteErrorResponse, Link, useRouteError } from 'react-router';
import { ApiError } from '@/api/client';
import { Button } from './ui/button';

export function ErrorView({ error, onRetry, compact = false }: { error: unknown; onRetry?: () => void; compact?: boolean }) {
  const notFound = (error instanceof ApiError && error.status === 404) || (isRouteErrorResponse(error) && error.status === 404);
  const title = notFound ? 'We couldn’t find that' : 'Something went wrong';
  const message = notFound
    ? 'It may have been removed, or the link is incorrect.'
    : error instanceof ApiError
      ? error.message
      : 'An unexpected error occurred. Please try again.';
  return (
    <div className={compact ? 'py-10' : 'py-24'}>
      <div className="mx-auto flex max-w-md flex-col items-center text-center">
        <div className="mb-4 grid size-12 place-items-center rounded-xl bg-danger-soft text-danger">
          <AlertTriangle className="size-5" />
        </div>
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="mt-1.5 text-[13px] text-muted">{message}</p>
        <div className="mt-5 flex gap-2">
          {onRetry && !notFound && (
            <Button onClick={onRetry} icon={<RefreshCw className="size-4" />}>
              Try again
            </Button>
          )}
          <Link to="/">
            <Button variant={onRetry && !notFound ? 'ghost' : 'primary'}>Back to problems</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

export function RouteErrorBoundary() {
  const error = useRouteError();
  return <ErrorView error={error} onRetry={() => window.location.reload()} />;
}
