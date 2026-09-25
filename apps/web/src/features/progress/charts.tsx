import { useId, useMemo, useState } from 'react';
import { formatShortDate } from '@/lib/format';

export interface TrendPoint {
  id: string;
  score: number;
  label: string;
  sublabel: string;
  date: string;
}

/**
 * Single-series score trend. One hue, 2px line, 8px markers, recessive grid,
 * crosshair + tooltip on hover/focus. No legend: the card title names the series.
 */
export function ScoreTrend({ points, onSelect }: { points: TrendPoint[]; onSelect?: (id: string) => void }) {
  const [active, setActive] = useState<number | null>(null);
  const titleId = useId();
  const width = 640;
  const height = 220;
  const pad = { top: 16, right: 16, bottom: 28, left: 36 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const coords = useMemo(
    () =>
      points.map((p, i) => ({
        x: pad.left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW),
        y: pad.top + innerH - (p.score / 100) * innerH,
      })),
    [points, innerW, innerH, pad.left, pad.top],
  );
  const path = coords.map((c, i) => `${i ? 'L' : 'M'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const current = active !== null ? points[active] : null;
  const currentXY = active !== null ? coords[active] : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full overflow-visible"
        role="group"
        aria-labelledby={titleId}
        onMouseLeave={() => setActive(null)}
      >
        <title id={titleId}>Score of each submission over time, from {points[0]?.score} to {points.at(-1)?.score}.</title>
        {[0, 25, 50, 75, 100].map((tick) => {
          const y = pad.top + innerH - (tick / 100) * innerH;
          return (
            <g key={tick}>
              <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} stroke="var(--border)" strokeDasharray={tick === 0 ? undefined : '2 4'} />
              <text x={pad.left - 8} y={y} dy="0.32em" textAnchor="end" fontSize="11" fill="var(--subtle)">
                {tick}
              </text>
            </g>
          );
        })}
        {currentXY && <line x1={currentXY.x} x2={currentXY.x} y1={pad.top} y2={pad.top + innerH} stroke="var(--border-strong)" />}
        <path d={path} fill="none" stroke="var(--primary)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {coords.map((c, i) => (
          <g key={points[i]!.id}>
            <circle cx={c.x} cy={c.y} r={active === i ? 5.5 : 4} fill="var(--primary)" stroke="var(--surface)" strokeWidth={2} />
            {/* Hit target larger than the mark */}
            <rect
              x={c.x - Math.max(12, innerW / Math.max(1, points.length) / 2)}
              y={pad.top}
              width={Math.max(24, innerW / Math.max(1, points.length))}
              height={innerH}
              fill="transparent"
              tabIndex={0}
              role="button"
              aria-label={`${points[i]!.label} ${points[i]!.sublabel}: ${points[i]!.score}`}
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              onClick={() => onSelect?.(points[i]!.id)}
              onKeyDown={(e) => e.key === 'Enter' && onSelect?.(points[i]!.id)}
              style={{ cursor: onSelect ? 'pointer' : 'default', outline: 'none' }}
            />
          </g>
        ))}
        {points.length > 1 && (
          <>
            <text x={coords[0]!.x} y={height - 6} fontSize="11" fill="var(--subtle)" textAnchor="start">
              {formatShortDate(points[0]!.date)}
            </text>
            <text x={coords.at(-1)!.x} y={height - 6} fontSize="11" fill="var(--subtle)" textAnchor="end">
              {formatShortDate(points.at(-1)!.date)}
            </text>
          </>
        )}
      </svg>
      {current && currentXY && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-md"
          style={{ left: `${(currentXY.x / width) * 100}%`, top: `${(currentXY.y / height) * 100}%`, marginTop: -10 }}
        >
          <div className="font-semibold text-fg">{current.label}</div>
          <div className="text-muted">{current.sublabel}</div>
          <div className="mt-1 font-semibold tabular-nums text-fg">{current.score} / 100</div>
        </div>
      )}
    </div>
  );
}

/** Horizontal bars for a single measure across categories, with value labels and hover detail. */
export function CriterionBars({ rows }: { rows: { id: string; name: string; value: number | null; hint: string }[] }) {
  const [active, setActive] = useState<string | null>(null);
  return (
    <ul className="space-y-3.5">
      {rows.map((row) => (
        <li
          key={row.id}
          onMouseEnter={() => setActive(row.id)}
          onMouseLeave={() => setActive(null)}
          className="group"
        >
          <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[13px]">
            <span className="font-medium text-fg-2">{row.name}</span>
            <span className="font-semibold tabular-nums text-fg">{row.value ?? '—'}</span>
          </div>
          <div className="relative h-2 rounded-full bg-surface-3">
            {row.value !== null && (
              <div
                className="h-full rounded-full bg-primary transition-[width,opacity] duration-500"
                style={{ width: `${Math.max(2, row.value)}%`, opacity: active && active !== row.id ? 0.45 : 1 }}
              />
            )}
          </div>
          <p className={`mt-1 text-xs text-muted transition-opacity ${active === row.id ? 'opacity-100' : 'opacity-0'} h-4`}>{row.hint}</p>
        </li>
      ))}
    </ul>
  );
}
