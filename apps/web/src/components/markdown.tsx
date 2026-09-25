import { Fragment, type ReactNode } from 'react';

/**
 * Minimal, safe Markdown for problem statements: paragraphs, **bold**,
 * *italic* and `code`. Never injects HTML.
 */
function inline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const token = match[0];
    if (token.startsWith('**')) parts.push(<strong key={match.index} className="font-semibold text-fg">{token.slice(2, -2)}</strong>);
    else if (token.startsWith('`')) parts.push(<code key={match.index} className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[0.9em]">{token.slice(1, -1)}</code>);
    else parts.push(<em key={match.index}>{token.slice(1, -1)}</em>);
    last = match.index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function Markdown({ source, className }: { source: string; className?: string }) {
  const paragraphs = source.split(/\n{2,}/).filter((p) => p.trim());
  return (
    <div className={className}>
      {paragraphs.map((p, i) => (
        <p key={i} className="mb-3 last:mb-0">
          {p.split('\n').map((line, j) => (
            <Fragment key={j}>
              {j > 0 && <br />}
              {inline(line)}
            </Fragment>
          ))}
        </p>
      ))}
    </div>
  );
}
