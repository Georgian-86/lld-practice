import { useQuery } from '@tanstack/react-query';
import { BarChart3, LayoutGrid, Moon, Sparkles, Sun } from 'lucide-react';
import { Link, NavLink, Outlet, ScrollRestoration } from 'react-router';
import { api, queryKeys } from '@/api/client';
import { useTheme } from '@/hooks/use-theme';
import { cn } from '@/lib/cn';
import { Tooltip } from './ui/tooltip';

export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="8" fill="var(--primary-solid)" />
      <g fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="7" y="7" width="8" height="6" rx="1.5" />
        <rect x="17" y="19" width="8" height="6" rx="1.5" />
        <path d="M11 13v5a2 2 0 0 0 2 2h4" />
      </g>
    </svg>
  );
}

function AiStatus() {
  const { data, isError } = useQuery({ queryKey: queryKeys.health, queryFn: api.health, staleTime: 60_000, retry: 1 });
  if (isError) {
    return (
      <Tooltip content="The server is not reachable right now.">
        <span className="hidden items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-danger sm:inline-flex">
          <span className="size-1.5 rounded-full bg-danger" /> Offline
        </span>
      </Tooltip>
    );
  }
  if (!data) return null;
  const simulated = data.aiReviewer.startsWith('simulated');
  const disabled = data.aiReviewer === 'disabled';
  const label = disabled ? 'Rules only' : simulated ? 'AI: simulated' : 'AI: Claude';
  const tip = disabled
    ? 'AI review is turned off. Feedback comes from deterministic design checks.'
    : simulated
      ? 'No API key is configured, so an offline simulator stands in for the AI reviewer. Set ANTHROPIC_API_KEY to use Claude.'
      : `AI review by ${data.aiReviewer.replace('anthropic:', '')}, grounded on deterministic design checks.`;
  return (
    <Tooltip content={tip} side="bottom">
      <span className="hidden items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-medium text-fg-2 sm:inline-flex">
        <Sparkles className={cn('size-3.5', disabled ? 'text-subtle' : 'text-ai')} />
        {label}
      </span>
    </Tooltip>
  );
}

const navItem = ({ isActive }: { isActive: boolean }) =>
  cn(
    'inline-flex h-8 items-center gap-2 rounded-lg px-3 text-[13px] font-medium transition-colors',
    isActive ? 'bg-surface-2 text-fg' : 'text-muted hover:text-fg',
  );

export function AppShell() {
  const { theme, toggle } = useTheme();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-surface/85 backdrop-blur supports-[backdrop-filter]:bg-surface/75">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-3 px-4 sm:gap-6 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5 font-semibold tracking-tight text-fg">
            <Logo className="size-7" />
            <span className="text-[15px]">Blueprint</span>
            <span className="hidden rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-muted sm:inline">LLD practice</span>
          </Link>
          <nav className="flex items-center gap-1" aria-label="Main">
            <NavLink to="/" end className={navItem} aria-label="Problems">
              <LayoutGrid className="size-4" /> <span className="hidden sm:inline">Problems</span>
            </NavLink>
            <NavLink to="/progress" className={navItem} aria-label="Progress">
              <BarChart3 className="size-4" /> <span className="hidden sm:inline">Progress</span>
            </NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <AiStatus />
            <Tooltip content={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} side="bottom">
              <button
                type="button"
                onClick={toggle}
                className="grid size-8 place-items-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-fg"
                aria-label="Toggle theme"
              >
                {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
              </button>
            </Tooltip>
          </div>
        </div>
      </header>
      <main className="flex flex-1 flex-col">
        <Outlet />
      </main>
      <ScrollRestoration />
    </div>
  );
}

export function PageContainer({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('mx-auto w-full max-w-[1200px] px-4 py-8 sm:px-6', className)}>{children}</div>;
}
