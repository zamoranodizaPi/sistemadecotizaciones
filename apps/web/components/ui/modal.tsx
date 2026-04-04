'use client';

import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[rgba(15,23,42,0.45)] p-4 backdrop-blur-sm">
      <div className="flex min-h-full items-center justify-center">
      <div className={cn('flex max-h-[calc(100vh-2rem)] w-full max-w-4xl flex-col overflow-hidden rounded-[32px] bg-white shadow-2xl', className)}>
        <div className="flex items-start justify-between border-b border-[var(--color-border)] px-6 py-5">
          <div>
            <h3 className="text-lg font-semibold text-[var(--color-text)]">{title}</h3>
            {description ? <p className="mt-1 text-sm text-[var(--color-text-muted)]">{description}</p> : null}
          </div>
          <button
            onClick={onClose}
            className="rounded-2xl p-2 text-[var(--color-text-muted)] transition hover:bg-[var(--color-panel-subtle)] hover:text-[var(--color-text)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto px-6 py-5">{children}</div>
      </div>
      </div>
    </div>
  );
}
