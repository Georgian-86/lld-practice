import * as RadixDialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] animate-fade-in" />
        <RadixDialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 flex max-h-[88vh] w-[calc(100vw-2rem)] flex-col rounded-2xl border border-border bg-surface shadow-lg animate-scale-in',
            size === 'sm' && 'max-w-md',
            size === 'md' && 'max-w-lg',
            size === 'lg' && 'max-w-3xl',
          )}
          onOpenAutoFocus={(e) => {
            // Focus the first form control rather than the close button.
            const target = (e.currentTarget as HTMLElement).querySelector<HTMLElement>('textarea, input, select');
            if (target) {
              e.preventDefault();
              target.focus();
            }
          }}
        >
          <div className="flex items-start justify-between gap-4 px-6 pb-2 pt-5">
            <div>
              <RadixDialog.Title className="text-base font-semibold text-fg">{title}</RadixDialog.Title>
              {description ? (
                <RadixDialog.Description className="mt-1 text-[13px] text-muted">{description}</RadixDialog.Description>
              ) : (
                <RadixDialog.Description className="sr-only">{typeof title === 'string' ? title : 'Dialog'}</RadixDialog.Description>
              )}
            </div>
            <RadixDialog.Close className="-mr-2 rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-fg" aria-label="Close">
              <X className="size-4" />
            </RadixDialog.Close>
          </div>
          {children && <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-6 py-3">{children}</div>}
          {footer && <div className="flex justify-end gap-2 border-t border-border px-6 py-4">{footer}</div>}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
