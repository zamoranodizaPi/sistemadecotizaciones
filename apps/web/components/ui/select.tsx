import type { SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'h-11 w-full appearance-none rounded-2xl border border-[var(--color-border)] bg-white px-4 text-sm text-[var(--color-text)] outline-none transition focus:border-[var(--color-primary)] focus:ring-4 focus:ring-[rgba(249,115,22,0.12)]',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

