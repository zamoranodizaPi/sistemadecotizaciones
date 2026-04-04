'use client';

import { Download, Grip } from 'lucide-react';
import { useMemo } from 'react';
import { useGeneratePdf, useKanban, useMoveQuotation, usePipelineSummary } from '@/lib/api/hooks';
import { buildKanbanColumns } from '@/lib/quotations';
import type { QuotationStatus } from '@/lib/api/types';
import { convertCurrencyAmount, formatCompactCurrency, formatCurrency, getAvatarTone, getInitials } from '@/lib/utils';
import { useDisplaySettings } from '@/components/providers/display-settings-provider';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { SectionHeading } from '@/components/ui/section-heading';
import { Skeleton } from '@/components/ui/skeleton';

function statusVariant(status: QuotationStatus) {
  switch (status) {
    case 'NUEVA':
      return 'new';
    case 'EN_PROCESO':
      return 'progress';
    case 'ENVIADA':
      return 'sent';
    case 'ACEPTADA':
      return 'accepted';
    case 'EJECUTADA':
      return 'executed';
    case 'CUENTAS_POR_COBRAR':
      return 'receivable';
    case 'PAGADA':
      return 'paid';
  }
}

export function KanbanBoard() {
  const kanbanQuery = useKanban();
  const pipelineQuery = usePipelineSummary();
  const moveMutation = useMoveQuotation();
  const pdfMutation = useGeneratePdf();
  const { displayCurrency, exchangeRate } = useDisplaySettings();

  const columns = useMemo(
    () => (kanbanQuery.data ? buildKanbanColumns(kanbanQuery.data) : []),
    [kanbanQuery.data],
  );

  async function handleDrop(nextStatus: QuotationStatus, cardId: string) {
    await moveMutation.mutateAsync({ id: cardId, status: nextStatus });
  }

  async function downloadPdf(id: string) {
    const response = await pdfMutation.mutateAsync(id);
    const link = document.createElement('a');
    link.href = `data:application/pdf;base64,${response.file}`;
    link.download = response.fileName;
    link.click();
  }

  const totalAmount = columns.reduce(
    (sum, column) =>
      sum +
      column.deals.reduce(
        (columnSum, deal) =>
          columnSum + convertCurrencyAmount(deal.total, deal.currency, displayCurrency, exchangeRate),
        0,
      ),
    0,
  );
  const forecastAmount = columns.reduce(
    (sum, column) =>
      sum +
      column.deals.reduce(
        (columnSum, deal) =>
          columnSum +
          convertCurrencyAmount(deal.forecastAmount, deal.currency, displayCurrency, exchangeRate),
        0,
      ),
    0,
  );
  const dealsCount = pipelineQuery.data?.metrics.deals || 0;
  const weightedCoverage = pipelineQuery.data?.metrics.weightedCoverage || 0;

  if (kanbanQuery.isLoading || pipelineQuery.isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Card key={index}>
              <CardContent className="space-y-4">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-10 w-36" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Skeleton className="h-[640px] w-full rounded-[32px]" />
      </div>
    );
  }

  if (kanbanQuery.isError || pipelineQuery.isError || !kanbanQuery.data || !pipelineQuery.data) {
    return (
      <Card>
        <CardContent className="py-10">
          <p className="text-sm text-[var(--color-text-muted)]">
            No fue posible cargar el pipeline comercial.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <SectionHeading title="Pipeline" />

      <section className="grid gap-4 xl:grid-cols-4">
        <Card>
          <CardContent className="space-y-2">
            <p className="text-sm text-[var(--color-text-muted)]">Valor total del pipeline</p>
            <p className="text-3xl font-semibold tracking-[-0.04em]">{formatCompactCurrency(totalAmount, displayCurrency)}</p>
            <p className="text-sm text-[var(--color-text-muted)]">{dealsCount} cotizaciones activas en seguimiento</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-2">
            <p className="text-sm text-[var(--color-text-muted)]">Forecast ponderado</p>
            <p className="text-3xl font-semibold tracking-[-0.04em]">{formatCompactCurrency(forecastAmount, displayCurrency)}</p>
            <p className="text-sm text-[var(--color-text-muted)]">Ingresos estimados por probabilidad de stage</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-2">
            <p className="text-sm text-[var(--color-text-muted)]">Cobertura ponderada</p>
            <p className="text-3xl font-semibold tracking-[-0.04em]">{weightedCoverage}%</p>
            <p className="text-sm text-[var(--color-text-muted)]">Solidez comercial del pipeline actual</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-2">
            <p className="text-sm text-[var(--color-text-muted)]">Pipeline activo</p>
            <p className="text-3xl font-semibold tracking-[-0.04em]">{pipelineQuery.data.pipeline.name}</p>
            <p className="text-sm text-[var(--color-text-muted)]">{columns.length} etapas visibles para operación</p>
          </CardContent>
        </Card>
      </section>

      <section>
        <div className="flex gap-4 overflow-x-auto pb-2">
          {columns.map((column) => (
            <div
              key={column.id}
              className="min-h-[640px] min-w-[320px] flex-1 rounded-[32px] border border-[var(--color-border)] bg-[var(--color-panel)] p-4"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                const cardId = event.dataTransfer.getData('text/plain');
                if (cardId) {
                  handleDrop(column.code, cardId);
                }
              }}
            >
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <Badge variant={statusVariant(column.code)}>{column.name}</Badge>
                  <p className="mt-2 text-xs uppercase tracking-[0.18em] text-[var(--color-text-faint)]">
                    {(column.probability * 100).toFixed(0)}% probabilidad
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-[var(--color-text)]">{column.deals.length}</p>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    {formatCompactCurrency(
                      column.deals.reduce(
                        (sum, deal) =>
                          sum + convertCurrencyAmount(deal.total, deal.currency, displayCurrency, exchangeRate),
                        0,
                      ),
                      displayCurrency,
                    )}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {column.deals.length ? (
                  column.deals.map((deal) => (
                    <div
                      key={deal.id}
                      draggable
                      onDragStart={(event) => event.dataTransfer.setData('text/plain', deal.id)}
                      className="w-full rounded-[26px] border border-transparent bg-[var(--color-panel-subtle)] p-4 text-left transition hover:-translate-y-0.5 hover:shadow-[0_16px_28px_rgba(15,23,42,0.08)]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-3">
                          <div
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border text-xs font-semibold uppercase tracking-[0.12em]"
                            style={getAvatarTone(deal.client)}
                          >
                            {getInitials(deal.client)}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium">{deal.folio}</p>
                            <p className="mt-1 truncate text-sm text-[var(--color-text-muted)]">{deal.client}</p>
                          </div>
                        </div>
                        <Grip className="mt-0.5 h-4 w-4 text-[var(--color-text-faint)]" />
                      </div>
                      <p className="mt-3 line-clamp-2 text-sm text-[var(--color-text)]">{deal.title}</p>
                      <div className="mt-4 grid gap-2 rounded-2xl bg-white px-3 py-3 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-[var(--color-text-muted)]">Monto</span>
                          <span className="font-semibold">
                            {formatCurrency(
                              convertCurrencyAmount(deal.total, deal.currency, displayCurrency, exchangeRate),
                              displayCurrency,
                            )}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[var(--color-text-muted)]">Forecast</span>
                          <span>
                            {formatCompactCurrency(
                              convertCurrencyAmount(
                                deal.forecastAmount,
                                deal.currency,
                                displayCurrency,
                                exchangeRate,
                              ),
                              displayCurrency,
                            )}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[var(--color-text-muted)]">Actualización</span>
                          <span>{deal.updatedAt}</span>
                        </div>
                      </div>
                      <p className="mt-2 text-xs font-medium text-[var(--color-text-muted)]">
                        Vendedor: {deal.owner}
                      </p>
                      <p className="mt-3 line-clamp-2 text-xs text-[var(--color-text-muted)]">{deal.lastActivity}</p>
                      <div className="mt-3">
                        <button
                          type="button"
                          onClick={() => downloadPdf(deal.id)}
                          className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-[11px] font-medium text-[var(--color-text)]"
                        >
                          <Download className="h-3.5 w-3.5" />
                          PDF
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-[24px] border border-dashed border-[var(--color-border)] px-4 py-10 text-center text-sm text-[var(--color-text-muted)]">
                    Sin cotizaciones en esta etapa
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
