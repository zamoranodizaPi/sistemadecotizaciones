import type { InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-11 w-full rounded-2xl border border-[var(--color-border)] bg-[rgba(255,255,255,0.95)] px-4 text-sm text-[var(--color-text)] shadow-[0_6px_16px_rgba(71,85,105,0.04)] outline-none transition placeholder:text-[var(--color-text-faint)] focus:border-[var(--color-primary)] focus:ring-4 focus:ring-[rgba(249,115,22,0.12)]',
        className,
      )}
      {...props}
    />
  );
}
