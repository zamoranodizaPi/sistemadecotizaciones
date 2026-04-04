import type { DashboardMetricsResponse, QuotationListResponse } from '@/lib/api/types';
import { convertCurrencyAmount, normalizeCurrency, type SupportedCurrency } from '@/lib/utils';

export function buildRevenueTrend(
  quotations: QuotationListResponse,
  displayCurrency: SupportedCurrency,
  exchangeRate: number,
) {
  const currentYear = new Date().getFullYear();
  const grouped = new Map<number, { month: string; quoted: number; won: number; year: number }>();

  for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
    grouped.set(monthIndex, {
      month: new Date(currentYear, monthIndex, 1).toLocaleDateString('es-MX', { month: 'short' }),
      quoted: 0,
      won: 0,
      year: currentYear,
    });
  }

  for (const quotation of quotations) {
    const date = new Date(quotation.createdAt);
    if (date.getFullYear() !== currentYear) {
      continue;
    }

    const current = grouped.get(date.getMonth()) || {
      month: date.toLocaleDateString('es-MX', { month: 'short' }),
      quoted: 0,
      won: 0,
      year: currentYear,
    };
    const total = convertCurrencyAmount(
      Number(quotation.total),
      normalizeCurrency(quotation.currency),
      displayCurrency,
      exchangeRate,
    );
    current.quoted += total;
    if (quotation.status === 'ACEPTADA' || quotation.status === 'PAGADA') {
      current.won += total;
    }
    grouped.set(date.getMonth(), current);
  }

  return Array.from(grouped.entries())
    .sort((left, right) => left[0] - right[0])
    .map(([, value]) => value)
    .filter((value) => value.quoted > 0 || value.won > 0);
}

export function buildDashboardCards(
  metrics: DashboardMetricsResponse,
  quotations: QuotationListResponse,
  displayCurrency: SupportedCurrency,
  exchangeRate: number,
) {
  const convertedPipelineTotal = quotations.reduce(
    (sum, quotation) =>
      sum +
      convertCurrencyAmount(
        Number(quotation.total),
        normalizeCurrency(quotation.currency),
        displayCurrency,
        exchangeRate,
      ),
    0,
  );
  const convertedForecast = quotations.reduce((sum, quotation) => {
    const probability = Number(quotation.stage?.probability || 0);
    const convertedTotal = convertCurrencyAmount(
      Number(quotation.total),
      normalizeCurrency(quotation.currency),
      displayCurrency,
      exchangeRate,
    );
    return sum + convertedTotal * probability;
  }, 0);
  const paid = quotations
    .filter((quotation) => quotation.status === 'PAGADA')
    .reduce(
      (sum, quotation) =>
        sum +
        convertCurrencyAmount(
          Number(quotation.total),
          normalizeCurrency(quotation.currency),
          displayCurrency,
          exchangeRate,
        ),
      0,
    );

  return [
    {
      label: 'Pipeline total',
      value: convertedPipelineTotal,
      helper: `${metrics.totalQuotations} cotizaciones registradas`,
      kind: 'currency' as const,
    },
    {
      label: 'Forecast',
      value: convertedForecast,
      helper: 'Monto ponderado por probabilidad de stage',
      kind: 'currency' as const,
    },
    {
      label: 'Conversión',
      value: metrics.conversionRate,
      helper: 'Cotizaciones ganadas frente al pipeline total',
      kind: 'percent' as const,
    },
    {
      label: 'Ingresos cobrados',
      value: paid,
      helper: 'Solo cotizaciones marcadas como pagadas',
      kind: 'currency' as const,
    },
  ];
}
