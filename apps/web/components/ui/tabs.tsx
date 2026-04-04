import { cn } from '@/lib/utils';

export function Tabs({
  items,
  active,
  onChange,
}: {
  items: Array<{ value: string; label: string }>;
  active: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="inline-flex rounded-2xl border border-[var(--color-border)] bg-white p-1">
      {items.map((item) => (
        <button
          key={item.value}
          onClick={() => onChange(item.value)}
          className={cn(
            'rounded-xl px-3 py-2 text-sm font-medium transition',
            active === item.value
              ? 'bg-[var(--color-secondary)] text-white'
              : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]',
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

