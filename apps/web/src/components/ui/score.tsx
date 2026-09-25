import type { Grade } from '@blueprint/shared';
import { GRADE_LABELS, gradeFor } from '@blueprint/shared';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';

export function scoreTone(score: number): 'success' | 'primary' | 'warning' | 'danger' {
  const grade = gradeFor(score);
  return grade === 'excellent' ? 'success' : grade === 'strong' ? 'primary' : grade === 'developing' ? 'warning' : 'danger';
}

const STROKES = { success: 'var(--success)', primary: 'var(--primary)', warning: 'var(--warning)', danger: 'var(--danger)' };
const TEXT = { success: 'text-success', primary: 'text-primary', warning: 'text-warning', danger: 'text-danger' };

export function ScoreRing({ score, size = 120, stroke = 10, label = true }: { score: number; size?: number; stroke?: number; label?: boolean }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, score));
  const tone = scoreTone(clamped);
  const shown = useCountUp(clamped, size >= 96);
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }} role="img" aria-label={`Score ${clamped} out of 100`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={STROKES[tone]}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - shown / 100)}
          style={{ transition: 'stroke-dashoffset 700ms cubic-bezier(0.16, 1, 0.3, 1)' }}
        />
      </svg>
      {label && (
        <div className="absolute inset-0 grid place-items-center">
          <div className="text-center leading-none">
            <div className={cn('font-semibold tabular-nums tracking-tight', TEXT[tone])} style={{ fontSize: size * 0.28 }}>
              {shown}
            </div>
            {size >= 96 && <div className="mt-1 text-[11px] font-medium text-muted">/ 100</div>}
          </div>
        </div>
      )}
    </div>
  );
}

export function ScorePill({ score, className }: { score: number | null; className?: string }) {
  if (score === null) return <span className={cn('text-xs text-subtle', className)}>—</span>;
  const tone = scoreTone(score);
  const tones = {
    success: 'bg-success-soft text-success-soft-fg',
    primary: 'bg-primary-soft text-primary-soft-fg',
    warning: 'bg-warning-soft text-warning-soft-fg',
    danger: 'bg-danger-soft text-danger-soft-fg',
  };
  return (
    <span className={cn('inline-flex min-w-9 justify-center rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums', tones[tone], className)}>
      {score}
    </span>
  );
}

export function GradeLabel({ grade }: { grade: Grade }) {
  return <>{GRADE_LABELS[grade]}</>;
}

export function Meter({ value, className, tone, label }: { value: number; className?: string; tone?: ReturnType<typeof scoreTone>; label: string }) {
  const t = tone ?? scoreTone(value);
  const bg = { success: 'bg-success', primary: 'bg-primary', warning: 'bg-warning', danger: 'bg-danger' }[t];
  return (
    <div className={cn('h-2 overflow-hidden rounded-full bg-surface-3', className)} role="meter" aria-label={label} aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn('h-full rounded-full transition-[width] duration-700', bg)} style={{ width: `${Math.max(2, Math.min(100, value))}%` }} />
    </div>
  );
}

/** Counts up to `target` once on mount (large score rings only); instant with reduced motion. */
function useCountUp(target: number, enabled: boolean): number {
  const [value, setValue] = useState(() =>
    enabled && typeof window !== 'undefined' && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : target,
  );
  useEffect(() => {
    if (value === target) return;
    const from = value;
    const start = performance.now();
    const duration = 900;
    let frame = requestAnimationFrame(function tick(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(from + (target - from) * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
    // Only re-run when the target changes; `value` is the animation's own state.
  }, [target]);
  return value;
}
