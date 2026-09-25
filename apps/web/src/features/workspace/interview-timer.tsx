import type { InterviewTimer as Timer } from '@blueprint/shared';
import { Timer as TimerIcon, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';

function format(seconds: number): string {
  const s = Math.abs(Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${rest}` : `${m}:${rest}`;
}

/** Remaining seconds for a timer (negative once over time). */
export function remainingSeconds(timer: Timer, now: number): number {
  return timer.minutes * 60 - (now - Date.parse(timer.startedAt)) / 1000;
}

/**
 * Interview mode: a countdown matching the problem's estimated time. It never
 * blocks anything. It turns amber in the last five minutes, and counts overtime
 * in red, because the point is to practise pacing.
 */
export function InterviewTimer({ timer, minutes, onStart, onStop }: { timer?: Timer; minutes: number; onStart: () => void; onStop: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  const wasRunning = useRef<boolean | null>(null);

  useEffect(() => {
    if (!timer) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [timer]);

  const left = timer ? remainingSeconds(timer, now) : 0;
  useEffect(() => {
    if (!timer) {
      wasRunning.current = null;
      return;
    }
    const running = left > 0;
    // Only announce the moment time runs out while the learner is here, not on reload of an expired timer.
    if (wasRunning.current === true && !running) {
      toast.warning('Time’s up', { description: 'In an interview you would present now. Submit what you have, or keep going and note the overtime.' });
    }
    wasRunning.current = running;
  }, [timer, left]);

  if (!timer) {
    return (
      <Button size="sm" variant="ghost" icon={<TimerIcon className="size-4" />} onClick={onStart} title={`Start a ${minutes}-minute interview timer`}>
        <span className="hidden xl:inline">Interview timer</span>
      </Button>
    );
  }

  const tone = left <= 0 ? 'danger' : left <= 300 ? 'warning' : 'normal';
  return (
    <span
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-full border pl-2.5 pr-1 text-[13px] font-semibold tabular-nums',
        tone === 'normal' && 'border-border bg-surface text-fg',
        tone === 'warning' && 'border-warning/40 bg-warning-soft text-warning-soft-fg',
        tone === 'danger' && 'border-danger/40 bg-danger-soft text-danger-soft-fg',
      )}
    >
      <TimerIcon className="size-3.5" aria-hidden />
      <span role="timer" aria-label={left > 0 ? `${format(left)} left in the interview` : `${format(left)} over time`}>
        {left > 0 ? format(left) : `+${format(left)}`}
      </span>
      <button type="button" onClick={onStop} className="rounded-full p-1 opacity-70 hover:bg-surface-2 hover:opacity-100" aria-label="Stop the interview timer" title="Stop the timer">
        <X className="size-3" />
      </button>
    </span>
  );
}
