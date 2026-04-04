'use client';

import { ArrowUpRight, MoveRight } from 'lucide-react';
import { useDashboardMetrics, useQuotations } from '@/lib/api/hooks';
import { buildDashboardCards, buildRevenueTrend } from '@/lib/dashboard';
import { mapQuotationsForUi } from '@/lib/quotations';
import {
  convertCurrencyAmount,
  formatCompactCurrency,
  formatCompactCurrencyBare,
  formatCurrency,
  formatCurrencyBare,
} from '@/lib/utils';
import { useDisplaySettings } from '@/components/providers/display-settings-provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { DataCell, DataRow, DataTable } from '@/components/ui/table';
import { SectionHeading } from '@/components/ui/section-heading';

function metricValue(
  metric: { kind: 'currency' | 'percent' | 'number'; value: number },
  displayCurrency: 'MXN' | 'USD',
) {
  if (metric.kind === 'currency') {
    return formatCompactCurrency(metric.value, displayCurrency);
  }

  if (metric.kind === 'percent') {
    return `${metric.value}%`;
  }

  return metric.value.toString();
}

function statusVariant(status: string) {
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
    default:
      return 'neutral';
  }
}

export function DashboardOverview() {
  const metricsQuery = useDashboardMetrics();
  const quotationsQuery = useQuotations();
  const { displayCurrency, exchangeRate } = useDisplaySettings();

  if (metricsQuery.isLoading || quotationsQuery.isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Card key={index}>
              <CardContent className="space-y-4">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-10 w-32" />
                <Skeleton className="h-4 w-44" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (metricsQuery.isError || quotationsQuery.isError || !metricsQuery.data || !quotationsQuery.data) {
    return (
      <Card>
        <CardContent className="py-10">
          <p className="text-sm text-[var(--color-text-muted)]">No fue posible cargar el dashboard desde la API.</p>
        </CardContent>
      </Card>
    );
  }

  const dashboardMetrics = buildDashboardCards(
    metricsQuery.data,
    quotationsQuery.data,
    displayCurrency,
    exchangeRate,
  );
  const quotations = mapQuotationsForUi(quotationsQuery.data);
  const revenueTrend = buildRevenueTrend(quotationsQuery.data, displayCurrency, exchangeRate);
  const pipelineSummary = metricsQuery.data.pipelineByStatus.map(([status]) => ({
    status,
    count: quotations.filter((quotation) => quotation.status === status).length,
    amount: quotations
      .filter((quotation) => quotation.status === status)
      .reduce(
        (sum, quotation) =>
          sum + convertCurrencyAmount(quotation.total, quotation.currency, displayCurrency, exchangeRate),
        0,
      ),
  }));
  const maxRevenue = Math.max(...revenueTrend.flatMap((item) => [item.quoted, item.won]), 1);
  const trendYear = revenueTrend[0]?.year || new Date().getFullYear();
  const piePalette = ['#f97316', '#fb923c', '#fdba74', '#fed7aa', '#1f2937', '#475569', '#94a3b8', '#cbd5e1'];
  const totalGenerated = revenueTrend.reduce((sum, item) => sum + item.quoted, 0);
  let pieCursor = 0;
  const pieSegments = revenueTrend.map((item, index) => {
    const ratio = totalGenerated > 0 ? item.quoted / totalGenerated : 0;
    const start = pieCursor;
    const end = pieCursor + ratio * 360;
    pieCursor = end;
    return {
      ...item,
      color: piePalette[index % piePalette.length],
      start,
      end,
      percentage: ratio * 100,
    };
  });
  const pieBackground = pieSegments.length
    ? `conic-gradient(${pieSegments
        .map((segment) => `${segment.color} ${segment.start}deg ${segment.end}deg`)
        .join(', ')})`
    : 'conic-gradient(#e5e7eb 0deg 360deg)';

  function exportSummaryPdf() {
    const generatedAt = new Date().toLocaleString('es-MX');
    const metricCards = dashboardMetrics
      .map(
        (metric) => `
          <div class="metric-card">
            <div class="metric-label">${metric.label}</div>
            <div class="metric-value">${metric.kind === 'currency' ? formatCompactCurrencyBare(metric.value, displayCurrency) : metricValue(metric, displayCurrency)}</div>
            <div class="metric-helper">${metric.helper}</div>
          </div>
        `,
      )
      .join('');

    const stageRows = pipelineSummary
      .map(
        (stage) => `
          <tr>
            <td>${stage.status}</td>
            <td>${stage.count}</td>
            <td style="text-align:right;">${formatCurrencyBare(stage.amount, displayCurrency)}</td>
          </tr>
        `,
      )
      .join('');

    const quotationRows = quotations
      .slice(0, 8)
      .map(
        (quotation) => `
          <tr>
            <td>${quotation.folio}</td>
            <td>${quotation.client}</td>
            <td>${quotation.owner}</td>
            <td>${quotation.status}</td>
            <td>${quotation.updatedAt}</td>
            <td style="text-align:right;">${formatCurrencyBare(
              convertCurrencyAmount(quotation.total, quotation.currency, displayCurrency, exchangeRate),
              displayCurrency,
            )}</td>
          </tr>
        `,
      )
      .join('');
    const exportMaxRevenue = Math.max(...revenueTrend.flatMap((item) => [item.quoted, item.won]), 1);
    const barChartWidth = Math.max(revenueTrend.length * 84, 520);
    const chartBaseY = 220;
    const chartTopY = 20;
    const chartHeight = chartBaseY - chartTopY;
    const barSlotWidth = revenueTrend.length ? barChartWidth / revenueTrend.length : barChartWidth;
    const barWidth = Math.min(20, Math.max(12, (barSlotWidth - 18) / 2));
    const barSvgBars = revenueTrend
      .map((item, index) => {
        const groupCenter = index * barSlotWidth + barSlotWidth / 2;
        const leftX = groupCenter - barWidth - 4;
        const rightX = groupCenter + 4;
        const newHeight = item.quoted > 0 ? Math.max((item.quoted / exportMaxRevenue) * chartHeight, 12) : 0;
        const wonHeight = item.won > 0 ? Math.max((item.won / exportMaxRevenue) * chartHeight, 12) : 0;

        return `
          <rect x="${leftX}" y="${chartBaseY - newHeight}" width="${barWidth}" height="${newHeight}" rx="6" fill="rgba(31,41,55,0.28)" />
          <rect x="${rightX}" y="${chartBaseY - wonHeight}" width="${barWidth}" height="${wonHeight}" rx="6" fill="#f97316" />
          <text x="${groupCenter}" y="242" text-anchor="middle" font-size="11" font-weight="700" fill="#374151">${item.month}</text>
          <text x="${groupCenter}" y="258" text-anchor="middle" font-size="9" fill="#6b7280">N ${formatCompactCurrencyBare(item.quoted, displayCurrency)}</text>
          <text x="${groupCenter}" y="272" text-anchor="middle" font-size="9" fill="#6b7280">C ${formatCompactCurrencyBare(item.won, displayCurrency)}</text>
        `;
      })
      .join('');
    const barSvg = revenueTrend.length
      ? `
        <svg viewBox="0 0 ${barChartWidth} 280" width="100%" height="280" role="img" aria-label="Ritmo de generación vs cierre">
          <line x1="0" y1="${chartBaseY}" x2="${barChartWidth}" y2="${chartBaseY}" stroke="#cbd5e1" stroke-width="1" />
          ${barSvgBars}
        </svg>
      `
      : '<div class="chart-subtitle">Sin movimientos en el periodo.</div>';

    const pieRadius = 76;
    const pieCircumference = 2 * Math.PI * pieRadius;
    let pieDashOffset = 0;
    const pieSvgSlices = pieSegments
      .map((segment) => {
        if (segment.percentage <= 0) {
          return '';
        }

        const sliceLength = (segment.percentage / 100) * pieCircumference;
        const circle = `
          <circle
            cx="110"
            cy="110"
            r="${pieRadius}"
            fill="none"
            stroke="${segment.color}"
            stroke-width="48"
            stroke-linecap="butt"
            stroke-dasharray="${sliceLength} ${pieCircumference - sliceLength}"
            stroke-dashoffset="${-pieDashOffset}"
            transform="rotate(-90 110 110)"
          />
        `;
        pieDashOffset += sliceLength;
        return circle;
      })
      .join('');
    const pieSvg = pieSegments.length
      ? `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 220" width="220" height="220" role="img" aria-label="Generado por mes">
          <circle cx="110" cy="110" r="${pieRadius}" fill="none" stroke="#e5e7eb" stroke-width="48" />
          ${pieSvgSlices}
          <circle cx="110" cy="110" r="52" fill="#fafafa" />
          <text x="110" y="100" text-anchor="middle" font-size="11" letter-spacing="1.5" fill="#94a3b8">TOTAL</text>
          <text x="110" y="122" text-anchor="middle" font-size="18" font-weight="700" fill="#111827">${formatCompactCurrencyBare(totalGenerated, displayCurrency)}</text>
        </svg>
      `
      : '<div class="chart-subtitle">Sin montos generados para el periodo.</div>';
    const pieLegend = pieSegments
      .map(
        (segment) => `
          <div class="pie-legend-row">
            <div class="pie-legend-left">
              <span class="pie-dot" style="background:${segment.color}"></span>
              <span>${segment.month}</span>
            </div>
            <div class="pie-legend-right">
              <strong>${formatCompactCurrencyBare(segment.quoted, displayCurrency)}</strong>
              <span>${segment.percentage.toFixed(1)}%</span>
            </div>
          </div>
        `,
      )
      .join('');

    const printableHtml = `
      <html>
        <head>
          <title>Forecast - resumen</title>
          <style>
            * { box-sizing: border-box; }
            body {
              margin: 0;
              padding: 32px;
              font-family: Arial, Helvetica, sans-serif;
              color: #111827;
              background: #ffffff;
            }
            .header {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              gap: 24px;
              padding-bottom: 18px;
              border-bottom: 2px solid #f97316;
            }
            .brand-wrap {
              display: flex;
              align-items: center;
              gap: 16px;
            }
            .logo-box {
              width: 72px;
              height: 72px;
              border-radius: 18px;
              border: 1px solid #fed7aa;
              background: #fff7ed;
              display: flex;
              align-items: center;
              justify-content: center;
              overflow: hidden;
            }
            .logo-box img {
              width: 56px;
              height: 56px;
              object-fit: contain;
            }
            .brand {
              font-size: 28px;
              font-weight: 700;
              letter-spacing: -0.03em;
            }
            .slogan {
              margin-top: 2px;
              color: #6b7280;
              font-size: 11px;
              letter-spacing: 0.22em;
              text-transform: uppercase;
            }
            .meta {
              text-align: right;
              color: #6b7280;
              font-size: 12px;
              line-height: 1.6;
            }
            h1 {
              margin: 0 0 8px;
              font-size: 32px;
              letter-spacing: -0.04em;
            }
            .subtitle {
              color: #6b7280;
              font-size: 14px;
            }
            .metrics {
              display: grid;
              grid-template-columns: repeat(2, minmax(0, 1fr));
              gap: 14px;
              margin: 26px 0;
            }
            .metric-card {
              border: 1px solid #e5e7eb;
              border-radius: 18px;
              padding: 16px;
              background: #fafafa;
            }
            .metric-label {
              font-size: 12px;
              text-transform: uppercase;
              letter-spacing: 0.12em;
              color: #6b7280;
            }
            .metric-value {
              margin-top: 8px;
              font-size: 26px;
              font-weight: 700;
            }
            .metric-helper {
              margin-top: 8px;
              font-size: 12px;
              color: #6b7280;
            }
            .chart-grid {
              display: grid;
              grid-template-columns: 1.25fr 0.95fr;
              gap: 18px;
              margin-top: 22px;
            }
            .chart-card {
              border: 1px solid #e5e7eb;
              border-radius: 18px;
              padding: 16px;
              background: #fafafa;
            }
            .chart-card h2 {
              margin: 0 0 8px;
              font-size: 14px;
              text-transform: uppercase;
              letter-spacing: 0.12em;
              color: #374151;
            }
            .chart-subtitle {
              margin-bottom: 12px;
              color: #6b7280;
              font-size: 12px;
            }
            .bar-legend {
              display: flex;
              gap: 16px;
              font-size: 11px;
              color: #6b7280;
              margin-bottom: 12px;
            }
            .bar-legend span {
              display: inline-flex;
              align-items: center;
              gap: 8px;
            }
            .bar-legend i {
              display: inline-block;
              width: 10px;
              height: 10px;
              border-radius: 999px;
            }
            .bar-chart {
              width: 100%;
              overflow: hidden;
            }
            .pie-wrap {
              display: flex;
              flex-direction: column;
              align-items: center;
              gap: 14px;
            }
            .pie-chart {
              width: 220px;
              height: 220px;
            }
            .pie-legend {
              width: 100%;
              display: flex;
              flex-direction: column;
              gap: 8px;
            }
            .pie-legend-row {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 12px;
              border-radius: 14px;
              background: #ffffff;
              padding: 10px 12px;
            }
            .pie-legend-left,
            .pie-legend-right {
              display: flex;
              align-items: center;
              gap: 10px;
              font-size: 12px;
            }
            .pie-legend-right {
              color: #6b7280;
            }
            .pie-dot {
              width: 10px;
              height: 10px;
              border-radius: 999px;
              display: inline-block;
            }
            .section {
              margin-top: 22px;
            }
            .section h2 {
              margin: 0 0 12px;
              font-size: 15px;
              text-transform: uppercase;
              letter-spacing: 0.12em;
              color: #374151;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              font-size: 12px;
            }
            th, td {
              padding: 10px 12px;
              border-bottom: 1px solid #e5e7eb;
              text-align: left;
            }
            th {
              background: #fafafa;
              color: #6b7280;
              text-transform: uppercase;
              letter-spacing: 0.1em;
              font-size: 11px;
            }
            @media print {
              body { padding: 18px; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="brand-wrap">
                <div class="logo-box">
                  <img src="/brand/logo.png" alt="SIEZA" />
                </div>
                <div>
                  <div class="brand">SIEZA</div>
                  <div class="slogan">energy solutions</div>
                </div>
              </div>
              <h1>Forecast</h1>
              <div class="subtitle">Resumen ejecutivo</div>
            </div>
            <div class="meta">
              Generado: ${generatedAt}
            </div>
          </div>

          <div class="metrics">${metricCards}</div>

          <div class="chart-grid">
            <div class="chart-card">
              <h2>Ritmo de generación vs cierre</h2>
              <div class="chart-subtitle">Comparativo mensual del año ${trendYear} entre cotizaciones nuevas y cerradas.</div>
              <div class="bar-legend">
                <span><i style="background:rgba(31,41,55,0.22)"></i>Nuevo</span>
                <span><i style="background:#f97316"></i>Cerrado</span>
              </div>
              <div class="bar-chart">${barSvg}</div>
            </div>
            <div class="chart-card">
              <h2>Generado por mes</h2>
              <div class="chart-subtitle">Participación mensual de lo generado durante ${trendYear}.</div>
              <div class="pie-wrap">
                <div class="pie-chart">${pieSvg}</div>
                <div class="pie-legend">${pieLegend || '<div class="chart-subtitle">Sin montos generados para el periodo.</div>'}</div>
              </div>
            </div>
          </div>

          <div class="section">
            <h2>Pipeline resumido</h2>
            <table>
              <thead>
                <tr>
                  <th>Etapa</th>
                  <th>Registros</th>
                  <th style="text-align:right;">Monto</th>
                </tr>
              </thead>
              <tbody>${stageRows}</tbody>
            </table>
          </div>

          <div class="section">
            <h2>Últimas cotizaciones</h2>
            <table>
              <thead>
                <tr>
                  <th>Folio</th>
                  <th>Cliente</th>
                  <th>Vendedor</th>
                  <th>Estado</th>
                  <th>Actualización</th>
                  <th style="text-align:right;">Total</th>
                </tr>
              </thead>
              <tbody>${quotationRows}</tbody>
            </table>
          </div>
        </body>
      </html>
    `;

    const frame = document.createElement('iframe');
    frame.style.position = 'fixed';
    frame.style.right = '0';
    frame.style.bottom = '0';
    frame.style.width = '0';
    frame.style.height = '0';
    frame.style.border = '0';
    frame.setAttribute('aria-hidden', 'true');
    document.body.appendChild(frame);

    const frameWindow = frame.contentWindow;
    const frameDocument = frame.contentDocument || frameWindow?.document;

    if (!frameWindow || !frameDocument) {
      document.body.removeChild(frame);
      return;
    }

    frameDocument.open();
    frameDocument.write(printableHtml);
    frameDocument.close();

    window.setTimeout(() => {
      frameWindow.focus();
      frameWindow.print();
      window.setTimeout(() => {
        document.body.removeChild(frame);
      }, 1000);
    }, 300);
  }

  return (
    <div className="space-y-6">
      <SectionHeading
        title="Forecast"
        action={
          <Button variant="secondary" onClick={exportSummaryPdf}>
            Exportar resumen
            <MoveRight className="h-4 w-4" />
          </Button>
        }
      />

      <section className="grid gap-4 xl:grid-cols-4">
        {dashboardMetrics.map((metric) => (
          <Card key={metric.label} className="overflow-hidden">
            <CardContent className="space-y-4">
              <div className="flex items-start justify-between">
                <p className="text-sm text-[var(--color-text-muted)]">{metric.label}</p>
                <div className="rounded-2xl bg-[rgba(249,115,22,0.1)] p-2 text-[var(--color-primary)]">
                  <ArrowUpRight className="h-4 w-4" />
                </div>
              </div>
              <div>
                <p className="text-3xl font-semibold tracking-[-0.04em]">{metricValue(metric, displayCurrency)}</p>
                <p className="mt-2 text-sm text-[var(--color-text-muted)]">{metric.helper}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.35fr_0.85fr_0.95fr]">
        <Card>
          <CardHeader
            title="Ritmo de generación vs cierre"
            description={`Comparativo mensual del año ${trendYear} entre montos de cotizaciones nuevas y montos cerrados.`}
          />
          <CardContent>
            <div className="mb-5 flex flex-wrap items-center gap-4 text-xs text-[var(--color-text-muted)]">
              <div className="inline-flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-[rgba(31,41,55,0.22)]" />
                Nuevo
              </div>
              <div className="inline-flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-[var(--color-primary)]" />
                Cerrado
              </div>
            </div>
            {!revenueTrend.length ? (
              <div className="rounded-3xl border border-dashed border-[var(--color-border)] px-4 py-14 text-center text-sm text-[var(--color-text-muted)]">
                No hay movimientos en cotizaciones durante el año {trendYear}.
              </div>
            ) : (
              <div className="flex h-80 items-end gap-2 overflow-x-auto pb-2">
                {revenueTrend.map((item) => (
                  <div key={`${item.year}-${item.month}`} className="flex h-full min-w-[76px] flex-1 flex-col items-center gap-3">
                    <div className="flex min-h-0 flex-1 w-full items-end justify-center gap-2 rounded-t-3xl bg-[rgba(255,255,255,0.55)] px-2 pt-3">
                      <div
                        className="w-1/2 rounded-t-2xl bg-[rgba(31,41,55,0.22)] shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]"
                        style={{ height: item.quoted > 0 ? `${Math.max((item.quoted / maxRevenue) * 100, 6)}%` : '0%' }}
                        title={`Nuevo ${item.month} ${trendYear}: ${formatCompactCurrency(item.quoted, displayCurrency)}`}
                      />
                      <div
                        className="w-1/2 rounded-t-2xl bg-[var(--color-primary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]"
                        style={{ height: item.won > 0 ? `${Math.max((item.won / maxRevenue) * 100, 6)}%` : '0%' }}
                        title={`Cerrado ${item.month} ${trendYear}: ${formatCompactCurrency(item.won, displayCurrency)}`}
                      />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium">{item.month}</p>
                      <p className="text-xs text-[var(--color-text-muted)]">
                        N: {formatCompactCurrency(item.quoted, displayCurrency)}
                      </p>
                      <p className="text-xs text-[var(--color-text-muted)]">
                        C: {formatCompactCurrency(item.won, displayCurrency)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader
            title="Generado por mes"
            description={`Participación mensual de lo generado durante ${trendYear}.`}
          />
          <CardContent className="space-y-5">
            {!pieSegments.length ? (
              <div className="rounded-3xl border border-dashed border-[var(--color-border)] px-4 py-14 text-center text-sm text-[var(--color-text-muted)]">
                No hay montos generados para graficar este año.
              </div>
            ) : (
              <>
                <div className="flex justify-center">
                  <div
                    className="relative h-56 w-56 rounded-full shadow-[0_16px_40px_rgba(71,85,105,0.10)]"
                    style={{ background: pieBackground }}
                  >
                    <div className="absolute inset-[22%] rounded-full bg-[var(--color-surface)] shadow-[inset_0_0_0_1px_rgba(148,163,184,0.12)]" />
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                      <p className="text-xs uppercase tracking-[0.16em] text-[var(--color-text-faint)]">Total</p>
                      <p className="mt-2 text-xl font-semibold tracking-[-0.03em]">
                        {formatCompactCurrency(totalGenerated, displayCurrency)}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  {pieSegments.map((segment) => (
                    <div
                      key={`${segment.year}-${segment.month}`}
                      className="flex items-center justify-between rounded-2xl bg-[var(--color-panel-subtle)] px-3 py-2"
                    >
                      <div className="flex items-center gap-3">
                        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: segment.color }} />
                        <span className="text-sm font-medium text-[var(--color-text)]">{segment.month}</span>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-[var(--color-text)]">
                          {formatCompactCurrency(segment.quoted, displayCurrency)}
                        </p>
                        <p className="text-[11px] text-[var(--color-text-muted)]">
                          {segment.percentage.toFixed(1)}%
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader title="Pipeline resumido" description="Concentración económica por etapa de cotización." />
          <CardContent className="space-y-4">
            {pipelineSummary.slice(0, 5).map((stage) => (
              <div key={stage.status} className="rounded-3xl bg-[var(--color-panel-subtle)] p-4">
                <div className="flex items-center justify-between">
                  <Badge variant={statusVariant(stage.status)}>{stage.status}</Badge>
                  <span className="text-sm text-[var(--color-text-muted)]">{stage.count} registros</span>
                </div>
                <p className="mt-4 text-2xl font-semibold tracking-[-0.03em]">{formatCompactCurrency(stage.amount, displayCurrency)}</p>
                <div className="mt-3 h-2 rounded-full bg-white">
                  <div
                    className="h-2 rounded-full bg-[var(--color-primary)]"
                    style={{ width: `${Math.min((stage.amount / Math.max(...pipelineSummary.map((item) => item.amount), 1)) * 100, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader title="Últimas cotizaciones" description="Solo las que mueven decisiones hoy." />
        <CardContent>
          <DataTable columns={['Folio', 'Cliente', 'Vendedor', 'Estado', 'Actualización', 'Total']}>
            {quotations.slice(0, 4).map((quotation) => (
              <DataRow key={quotation.id} interactive>
                <DataCell>
                  <div>
                    <p className="font-medium">{quotation.folio}</p>
                    <p className="text-xs text-[var(--color-text-muted)]">{quotation.items} conceptos</p>
                  </div>
                </DataCell>
                <DataCell>{quotation.client}</DataCell>
                <DataCell>{quotation.owner}</DataCell>
                <DataCell>
                  <Badge variant={statusVariant(quotation.status)}>{quotation.status}</Badge>
                </DataCell>
                <DataCell>
                  <div>
                    <p>{quotation.updatedAt}</p>
                    <p className="text-xs text-[var(--color-text-muted)]">{quotation.dueLabel}</p>
                  </div>
                </DataCell>
                <DataCell className="font-medium">
                  {formatCurrency(
                    convertCurrencyAmount(quotation.total, quotation.currency, displayCurrency, exchangeRate),
                    displayCurrency,
                  )}
                </DataCell>
              </DataRow>
            ))}
          </DataTable>
        </CardContent>
      </Card>
    </div>
  );
}
