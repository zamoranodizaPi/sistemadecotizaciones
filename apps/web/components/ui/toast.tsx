import { CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Toast({
  title,
  description,
  tone = 'success',
}: {
  title: string;
  description: string;
  tone?: 'success' | 'warning';
}) {
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-2xl border px-4 py-3 shadow-lg',
        tone === 'success'
          ? 'border-emerald-100 bg-emerald-50 text-emerald-900'
          : 'border-amber-100 bg-amber-50 text-amber-900',
      )}
    >
      {tone === 'success' ? <CheckCircle2 className="mt-0.5 h-4 w-4" /> : <AlertCircle className="mt-0.5 h-4 w-4" />}
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-sm opacity-80">{description}</p>
      </div>
    </div>
  );
}

