import { forwardRef, useLayoutEffect, useRef, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

/** Textarea that grows with its content (up to maxRows) instead of scrolling. */
export const AutoTextarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { minRows?: number; maxRows?: number }>(
  function AutoTextarea({ className, minRows = 2, maxRows = 14, value, ...props }, forwarded) {
    const inner = useRef<HTMLTextAreaElement | null>(null);
    useLayoutEffect(() => {
      const el = inner.current;
      if (!el) return;
      const line = parseFloat(getComputedStyle(el).lineHeight) || 20;
      const padding = 18;
      el.style.height = 'auto';
      const height = Math.min(Math.max(el.scrollHeight, minRows * line + padding), maxRows * line + padding);
      el.style.height = `${height}px`;
      el.style.overflowY = el.scrollHeight > height ? 'auto' : 'hidden';
    }, [value, minRows, maxRows]);
    return (
      <textarea
        ref={(node) => {
          inner.current = node;
          if (typeof forwarded === 'function') forwarded(node);
          else if (forwarded) forwarded.current = node;
        }}
        value={value}
        className={cn('field resize-none leading-5', className)}
        {...props}
      />
    );
  },
);
