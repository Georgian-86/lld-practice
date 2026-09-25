import * as RadixTabs from '@radix-ui/react-tabs';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export const Tabs = RadixTabs.Root;
export const TabsContent = RadixTabs.Content;

export function TabsList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <RadixTabs.List className={cn('flex items-center gap-1 overflow-x-auto scrollbar-thin', className)}>{children}</RadixTabs.List>
  );
}

/** Underline-style tab trigger used for page-level navigation. */
export function TabsTrigger({ value, children, className }: { value: string; children: ReactNode; className?: string }) {
  return (
    <RadixTabs.Trigger
      value={value}
      className={cn(
        'relative inline-flex h-10 items-center gap-2 whitespace-nowrap px-3 text-[13px] font-medium text-muted transition-colors hover:text-fg',
        'after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-transparent',
        'data-[state=active]:text-fg data-[state=active]:after:bg-primary',
        className,
      )}
    >
      {children}
    </RadixTabs.Trigger>
  );
}

/** Pill/segmented trigger used for filters. */
export function PillTrigger({ value, children }: { value: string; children: ReactNode }) {
  return (
    <RadixTabs.Trigger
      value={value}
      className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium text-muted transition hover:text-fg data-[state=active]:bg-surface data-[state=active]:text-fg data-[state=active]:shadow-sm"
    >
      {children}
    </RadixTabs.Trigger>
  );
}
