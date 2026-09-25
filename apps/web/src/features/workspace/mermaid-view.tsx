import { AlertTriangle } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useTheme } from '@/hooks/use-theme';
import { Skeleton } from '@/components/ui/misc';

type MermaidApi = typeof import('mermaid').default;
let loader: Promise<MermaidApi> | null = null;
let initializedTheme: string | null = null;

function loadMermaid(): Promise<MermaidApi> {
  loader ??= import('mermaid').then((m) => m.default);
  return loader;
}

/** Renders Mermaid source to SVG. Lazy-loads the (large) library on first use. */
export function MermaidView({ source, className }: { source: string; className?: string }) {
  const { theme } = useTheme();
  const reactId = useId().replace(/[^a-zA-Z0-9]/g, '');
  const counter = useRef(0);
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const handle = setTimeout(async () => {
      try {
        const mermaid = await loadMermaid();
        if (initializedTheme !== theme) {
          // Derive the diagram palette from the app's design tokens so it matches both themes.
          const css = getComputedStyle(document.documentElement);
          const token = (name: string) => css.getPropertyValue(name).trim();
          mermaid.initialize({
            startOnLoad: false,
            securityLevel: 'strict',
            theme: 'base',
            fontFamily: "'Inter Variable', Inter, ui-sans-serif, system-ui, sans-serif",
            themeVariables: {
              darkMode: theme === 'dark',
              background: token('--surface'),
              mainBkg: token('--surface'),
              primaryColor: token('--surface'),
              primaryTextColor: token('--fg'),
              primaryBorderColor: token('--primary'),
              secondaryColor: token('--surface-2'),
              tertiaryColor: token('--surface-2'),
              lineColor: token('--muted'),
              textColor: token('--fg-2'),
              classText: token('--fg'),
              nodeBorder: token('--primary'),
              edgeLabelBackground: token('--surface-2'),
              fontSize: '14px',
            },
            class: { hideEmptyMembersBox: true },
          });
          initializedTheme = theme;
        }
        const { svg } = await mermaid.render(`mmd-${reactId}-${++counter.current}`, source);
        if (!cancelled) {
          setSvg(svg);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message.split('\n')[0]! : 'Could not render the diagram.');
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [source, theme, reactId]);

  if (error) {
    return (
      <div className="flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2.5 text-[13px] text-danger-soft-fg">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <span>The diagram could not be drawn: {error}</span>
      </div>
    );
  }
  if (!svg) return <Skeleton className="h-64 w-full" />;
  return (
    <div
      className={className}
      // Mermaid output with securityLevel "strict" is sanitised by the library.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
