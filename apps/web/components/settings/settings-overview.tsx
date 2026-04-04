'use client';

import { useEffect, useState } from 'react';
import { RefreshCw, Settings2 } from 'lucide-react';
import { useRefreshExchangeRate, useUpdateExchangeRate } from '@/lib/api/hooks';
import { useDisplaySettings } from '@/components/providers/display-settings-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { SectionHeading } from '@/components/ui/section-heading';
import { Select } from '@/components/ui/select';
import { Toast } from '@/components/ui/toast';

export function SettingsOverview() {
  const {
    displayCurrency,
    setDisplayCurrency,
    exchangeRate,
    exchangeRateSource,
    exchangeRateUpdatedAt,
  } = useDisplaySettings();
  const refreshExchangeRateMutation = useRefreshExchangeRate();
  const updateExchangeRateMutation = useUpdateExchangeRate();
  const [rateInput, setRateInput] = useState('');
  const [showToast, setShowToast] = useState<null | { title: string; description: string }>(null);

  useEffect(() => {
    if (exchangeRate) {
      setRateInput(String(exchangeRate));
    }
  }, [exchangeRate]);

  function notify(title: string, description: string) {
    setShowToast({ title, description });
    window.setTimeout(() => setShowToast(null), 2500);
  }

  async function saveExchangeRate() {
    const nextRate = Number(rateInput);
    if (!nextRate || Number.isNaN(nextRate) || nextRate <= 0) {
      return;
    }

    await updateExchangeRateMutation.mutateAsync(nextRate);
    notify('Tipo de cambio actualizado', 'La visualización global ya usa el nuevo valor.');
  }

  async function refreshExchangeRate() {
    await refreshExchangeRateMutation.mutateAsync();
    notify('Tipo de cambio actualizado', 'Se consultó un nuevo valor automático.');
  }

  return (
    <div className="space-y-6">
      {showToast ? (
        <div className="fixed bottom-6 right-6 z-40">
          <Toast title={showToast.title} description={showToast.description} />
        </div>
      ) : null}

      <SectionHeading
        eyebrow="Configuración"
        title="Moneda y tipo de cambio"
        description="La moneda seleccionada aquí se usa para visualizar montos mixtos en cotizaciones, pipeline, dashboard y clientes."
      />

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader
            title="Visualización global"
            description="Define la moneda objetivo de la interfaz. Los totales se convierten usando el tipo de cambio activo."
          />
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="mb-2 text-sm font-medium text-[var(--color-text)]">Moneda de visualización</p>
                <Select
                  value={displayCurrency}
                  onChange={(event) => setDisplayCurrency(event.target.value as 'MXN' | 'USD')}
                >
                  <option value="MXN">Pesos mexicanos</option>
                  <option value="USD">Dólares</option>
                </Select>
              </div>
              <div className="rounded-3xl bg-[var(--color-panel-subtle)] p-4">
                <p className="text-sm text-[var(--color-text-muted)]">Moneda actual</p>
                <p className="mt-2 text-2xl font-semibold tracking-[-0.03em]">{displayCurrency}</p>
                <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                  Todos los montos visibles se convierten a esta moneda.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader
            title="Tipo de cambio activo"
            description="Se usa para convertir montos entre MXN y USD en toda la interfaz."
          />
          <CardContent className="space-y-4">
            <div className="rounded-3xl bg-[var(--color-panel-subtle)] p-4">
              <p className="text-sm text-[var(--color-text-muted)]">Valor actual</p>
              <p className="mt-2 text-2xl font-semibold tracking-[-0.03em]">{exchangeRate || '-'}</p>
              <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                Fuente: {exchangeRateSource}
                {exchangeRateUpdatedAt
                  ? ` · actualizado ${new Date(exchangeRateUpdatedAt).toLocaleString('es-MX')}`
                  : ''}
              </p>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-[var(--color-text)]">Ajuste manual</p>
              <Input value={rateInput} onChange={(event) => setRateInput(event.target.value.replace(/[^0-9.]/g, ''))} />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={saveExchangeRate} disabled={updateExchangeRateMutation.isPending}>
                <Settings2 className="h-4 w-4" />
                Guardar tipo de cambio
              </Button>
              <Button variant="secondary" onClick={refreshExchangeRate} disabled={refreshExchangeRateMutation.isPending}>
                <RefreshCw className="h-4 w-4" />
                Actualizar automático
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
