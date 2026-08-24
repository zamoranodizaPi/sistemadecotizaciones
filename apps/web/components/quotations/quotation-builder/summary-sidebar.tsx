'use client';

import { Sparkles } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/utils';
import { formatPercentageLabel } from '../quotation-builder.utils';

export type ClientInsights = {
  source: 'client' | 'industry';
  industry?: string;
  quotationCount: number;
  frequentServices: Array<{ name: string; count: number }>;
  frequentWorkItems: Array<{ name: string; count: number }>;
  travelLocations: Array<{ name: string; count: number }>;
  avgTotal: number | null;
};

type SummarySidebarProps = {
  title: string;
  executiveSummary: string;
  itemsCount: number;
  subtotal: number;
  tax: number;
  total: number;
  currency: 'MXN' | 'USD';
  finalChargeLabel: string;
  finalChargeRate: number;
  insights?: ClientInsights | null;
  onApplyTravelSuggestions?: () => void;
};

/**
 * Resumen persistente (subtotal/IVA/total + conteo de conceptos) visible en
 * los pasos que hoy no tenian ningun total a la vista. En el paso "client"
 * ademas muestra las sugerencias anticipadas basadas en el historial real
 * del cliente (o de su industria si es cliente nuevo).
 */
export function QuotationSummarySidebar({
  title,
  executiveSummary,
  itemsCount,
  subtotal,
  tax,
  total,
  currency,
  finalChargeLabel,
  finalChargeRate,
  insights,
  onApplyTravelSuggestions,
}: SummarySidebarProps) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Resumen" description="Se actualiza con cada paso." />
        <CardContent className="space-y-4">
          <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-panel-subtle)] p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-faint)]">Servicio solicitado</p>
            <p className="mt-2 text-sm font-semibold text-[var(--color-text)]">{title || 'Sin servicio descrito'}</p>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">{executiveSummary || 'Resumen ejecutivo no proporcionado.'}</p>
          </div>
          <p className="text-sm text-[var(--color-text-muted)]">{itemsCount} concepto(s) agregados</p>
          <div className="rounded-[24px] bg-[var(--color-secondary)] p-4 text-white">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-white/70">Subtotal</span><span>{formatCurrency(subtotal, currency)}</span></div>
              <div className="flex justify-between"><span className="text-white/70">{finalChargeLabel} {formatPercentageLabel(finalChargeRate)}</span><span>{formatCurrency(tax, currency)}</span></div>
              <div className="flex justify-between border-t border-white/10 pt-2 text-base font-semibold"><span>Total</span><span>{formatCurrency(total, currency)}</span></div>
            </div>
          </div>
        </CardContent>
      </Card>

      {insights ? (
        <Card>
          <CardHeader
            title="Sugerencias anticipadas"
            description={
              insights.source === 'client'
                ? `Basado en ${insights.quotationCount} cotizacion(es) previas con este cliente.`
                : `Este cliente es nuevo. Basado en clientes del sector "${insights.industry}".`
            }
          />
          <CardContent className="space-y-3">
            {insights.frequentServices.length ? (
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-[var(--color-text-faint)]">Suele pedir</p>
                <ul className="mt-2 space-y-1 text-sm text-[var(--color-text)]">
                  {insights.frequentServices.slice(0, 5).map((service) => (
                    <li key={service.name} className="flex items-start gap-2">
                      <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-primary)]" />
                      <span>{service.name}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {insights.travelLocations.length ? (
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-[var(--color-text-faint)]">Suele requerir viáticos a</p>
                <p className="mt-1 text-sm text-[var(--color-text)]">
                  {insights.travelLocations.map((location) => location.name).join(', ')}
                </p>
              </div>
            ) : null}
            {onApplyTravelSuggestions && insights.travelLocations.length ? (
              <Button variant="secondary" size="sm" onClick={onApplyTravelSuggestions}>
                <Sparkles className="h-4 w-4" />
                Agregar viáticos sugeridos
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
