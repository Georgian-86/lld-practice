import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'ai';

const tones: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-fg-2 ring-border',
  primary: 'bg-primary-soft text-primary-soft-fg ring-primary/20',
  success: 'bg-success-soft text-success-soft-fg ring-success/20',
  warning: 'bg-warning-soft text-warning-soft-fg ring-warning/25',
  danger: 'bg-danger-soft text-danger-soft-fg ring-danger/20',
  info: 'bg-info-soft text-info-soft-fg ring-info/20',
  ai: 'bg-ai-soft text-ai-soft-fg ring-ai/20',
};

export function Badge({ tone = 'neutral', className, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset',
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
