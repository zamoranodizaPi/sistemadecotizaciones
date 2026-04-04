import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type BadgeVariant =
  | 'neutral'
  | 'info'
  | 'success'
  | 'warning'
  | 'danger'
  | 'new'
  | 'progress'
  | 'sent'
  | 'accepted'
  | 'executed'
  | 'receivable'
  | 'paid';

const variants: Record<BadgeVariant, string> = {
  neutral: 'bg-slate-100 text-slate-700',
  info: 'bg-blue-50 text-blue-700',
  success: 'bg-emerald-50 text-emerald-700',
  warning: 'bg-amber-50 text-amber-700',
  danger: 'bg-rose-50 text-rose-700',
  new: 'bg-slate-100 text-slate-700',
  progress: 'bg-blue-50 text-blue-700',
  sent: 'bg-violet-50 text-violet-700',
  accepted: 'bg-emerald-50 text-emerald-700',
  executed: 'bg-orange-50 text-orange-700',
  receivable: 'bg-amber-50 text-amber-700',
  paid: 'bg-emerald-100 text-emerald-900',
};

export function Badge({
  children,
  variant = 'neutral',
  className,
}: {
  children: ReactNode;
  variant?: BadgeVariant;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium tracking-[0.01em]',
        variants[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}

