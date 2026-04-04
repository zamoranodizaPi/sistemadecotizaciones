import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function DataTable({
  columns,
  columnWidths,
  children,
}: {
  columns: string[];
  columnWidths?: Array<string | undefined>;
  children: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-[24px] border border-[var(--color-border)] bg-[rgba(255,255,255,0.96)] shadow-[0_12px_28px_rgba(71,85,105,0.06)]">
      <table className="w-full border-collapse text-left text-sm">
        {columnWidths?.length ? (
          <colgroup>
            {columns.map((column, index) => (
              <col key={column} style={columnWidths[index] ? { width: columnWidths[index] } : undefined} />
            ))}
          </colgroup>
        ) : null}
        <thead className="bg-[linear-gradient(180deg,rgba(249,115,22,0.08),rgba(255,255,255,0.9))] text-[var(--color-text-muted)]">
          <tr>
            {columns.map((column) => (
              <th key={column} className="px-5 py-3 font-medium">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function DataRow({
  children,
  interactive = false,
  className,
  onClick,
}: {
  children: ReactNode;
  interactive?: boolean;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <tr
      onClick={onClick}
      className={cn(
        'border-t border-[var(--color-border)]',
        interactive && 'cursor-pointer transition hover:bg-[rgba(249,115,22,0.06)]',
        className,
      )}
    >
      {children}
    </tr>
  );
}

export function DataCell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <td className={cn('px-5 py-4 align-middle text-[var(--color-text)]', className)}>{children}</td>;
}
