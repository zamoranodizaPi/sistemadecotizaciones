'use client';

import { useEffect, useRef, useState } from 'react';
import { FileSpreadsheet, UploadCloud } from 'lucide-react';
import {
  useConfirmImportExcel,
  useExchangeRate,
  useExportCatalogExcel,
  usePreviewImportExcel,
  useUpdateExchangeRate,
} from '@/lib/api/hooks';
import type { ImportConfirmResponse, ImportPreviewResponse } from '@/lib/api/types';
import { formatCurrency } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { SectionHeading } from '@/components/ui/section-heading';
import { Toast } from '@/components/ui/toast';

type EditablePreviewRow = ImportPreviewResponse['rows'][number];

function parseMoney(value: string) {
  const normalized = value.replace(/[^0-9.-]/g, '');
  const parsed = Number(normalized);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function truncateToTwoDecimals(value: number) {
  return Math.trunc(value * 100) / 100;
}

export function ImportWorkspace() {
  const [isDragging, setIsDragging] = useState(false);
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [rows, setRows] = useState<EditablePreviewRow[]>([]);
  const [result, setResult] = useState<ImportConfirmResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState(false);
  const [exchangeRateInput, setExchangeRateInput] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const exchangeRateQuery = useExchangeRate();
  const updateExchangeRateMutation = useUpdateExchangeRate();
  const previewMutation = usePreviewImportExcel();
  const confirmMutation = useConfirmImportExcel();
  const exportMutation = useExportCatalogExcel();

  useEffect(() => {
    if (!preview && exchangeRateQuery.data) {
      setExchangeRateInput(String(exchangeRateQuery.data.rate));
    }
  }, [exchangeRateQuery.data, preview]);

  function recalculateRows(nextRate: number) {
    setRows((current) =>
      current.map((row) => ({
        ...row,
        options: row.options.map((option) => ({
          ...option,
          usdPrice: truncateToTwoDecimals(option.mxnPrice / nextRate),
        })),
      })),
    );
  }

  function resetWorkspace() {
    setPreview(null);
    setRows([]);
    setResult(null);
    setUploaded(false);
    setErrorMessage(null);
    setIsDragging(false);
    setExchangeRateInput(exchangeRateQuery.data ? String(exchangeRateQuery.data.rate) : '');
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  }

  async function processFile(file: File) {
    resetWorkspace();
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64 = String(reader.result).split(',')[1];
        const response = await previewMutation.mutateAsync({
          file: base64,
          source: file.name,
        });
        setUploaded(false);
        setPreview(response);
        setRows(response.rows);
        setExchangeRateInput(String(response.exchangeRate));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'No fue posible procesar el archivo.';
        setUploaded(false);
        setPreview(null);
        setRows([]);
        setResult(null);
        setErrorMessage(message);
      }
    };
    reader.readAsDataURL(file);
  }

  async function confirmImport() {
    if (!preview) {
      return;
    }

    try {
      setErrorMessage(null);
      const currentRate = parseMoney(exchangeRateInput);
      const response = await confirmMutation.mutateAsync({
        source: preview.source,
        exchangeRate: currentRate || preview.exchangeRate,
        rows,
      });
      setUploaded(true);
      setResult(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No fue posible confirmar la importación.';
      setUploaded(false);
      setResult(null);
      setErrorMessage(message);
    }
  }

  async function saveExchangeRate() {
    const nextRate = parseMoney(exchangeRateInput);
    if (!nextRate) {
      return;
    }

    await updateExchangeRateMutation.mutateAsync(nextRate);
    if (preview) {
      setPreview({ ...preview, exchangeRate: nextRate });
      recalculateRows(nextRate);
    }
  }

  function applyExchangeRateToPreview() {
    const nextRate = parseMoney(exchangeRateInput);
    if (!nextRate || !preview) {
      return;
    }

    setPreview({ ...preview, exchangeRate: nextRate });
    recalculateRows(nextRate);
  }

  async function exportCatalog() {
    try {
      setErrorMessage(null);
      const response = await exportMutation.mutateAsync();
      const link = document.createElement('a');
      link.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${response.file}`;
      link.download = response.fileName;
      link.click();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No fue posible exportar el catálogo.';
      setErrorMessage(message);
    }
  }

  return (
    <div className="space-y-6">
      <SectionHeading
        eyebrow="Importador Excel"
        title="Preview editable antes de crear campos"
        description="Primero revisas la tabla, ajustas manualmente y solo después confirmas la creación real de servicios y opciones."
      />

      {uploaded ? (
        <div className="fixed bottom-6 right-6 z-40">
          <Toast title="Importación aplicada" description="Los servicios y opciones ya quedaron guardados en catálogo." />
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader
            title="Carga y validación"
            description="El archivo se parsea primero; no crea nada hasta que confirmes."
            action={
              <Button
                variant="secondary"
                onClick={exportCatalog}
                disabled={exportMutation.isPending}
              >
                Exportar catálogo
              </Button>
            }
          />
          <CardContent>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  processFile(file);
                }
              }}
            />
            <div
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setIsDragging(false);
                if (inputRef.current) {
                  inputRef.current.value = '';
                }
                const file = event.dataTransfer.files?.[0];
                if (file) {
                  processFile(file);
                }
              }}
              className={`flex min-h-[280px] flex-col items-center justify-center rounded-[32px] border border-dashed p-8 text-center transition ${
                isDragging
                  ? 'border-[var(--color-primary)] bg-[rgba(249,115,22,0.06)]'
                  : 'border-[var(--color-border)] bg-[var(--color-panel-subtle)]'
              }`}
            >
              <div className="rounded-[28px] bg-white p-5 text-[var(--color-primary)] shadow-sm">
                <UploadCloud className="h-10 w-10" />
              </div>
              <h3 className="mt-6 text-2xl font-semibold tracking-[-0.03em]">Arrastra el archivo .xlsx</h3>
              <p className="mt-3 max-w-md text-sm text-[var(--color-text-muted)]">
                El preview leerá categoría, sufijo, consecutivo, servicio y las opciones definidas en renglones 2 y 3.
              </p>
              <Button className="mt-6" onClick={() => inputRef.current?.click()}>
                Seleccionar archivo
              </Button>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-[var(--color-panel-subtle)] p-4">
                <p className="text-sm text-[var(--color-text-muted)]">Filas preview</p>
                <p className="mt-1 text-2xl font-semibold text-[var(--color-text)]">{preview?.rows.length || 0}</p>
              </div>
              <div className="rounded-2xl bg-[var(--color-panel-subtle)] p-4">
                <p className="text-sm text-[var(--color-text-muted)]">Tipo de cambio</p>
                <p className="mt-1 text-2xl font-semibold text-[var(--color-text)]">{preview?.exchangeRate || exchangeRateQuery.data?.rate || '-'}</p>
              </div>
              <div className="rounded-2xl bg-[var(--color-panel-subtle)] p-4">
                <p className="text-sm text-[var(--color-text-muted)]">Estado</p>
                <p className="mt-1 text-2xl font-semibold text-[var(--color-text)]">
                  {previewMutation.isPending ? 'Leyendo' : result ? 'Aplicado' : preview ? 'Listo' : 'Esperando'}
                </p>
              </div>
            </div>

            <div className="mt-5 rounded-[24px] border border-[var(--color-border)] bg-white p-4">
              <p className="text-sm font-medium text-[var(--color-text)]">Tipo de cambio para esta importación</p>
              <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                Puedes ajustarlo manualmente antes de guardar y recalcular todos los valores en USD del preview.
              </p>
              <div className="mt-4 grid gap-3 md:grid-cols-[180px_auto_auto]">
                <div className="relative">
                  <span className="pointer-events-none absolute left-4 top-3.5 text-sm text-[var(--color-text-muted)]">TC</span>
                  <Input
                    value={exchangeRateInput}
                    onChange={(event) => setExchangeRateInput(event.target.value.replace(/[^0-9.]/g, ''))}
                    className="pl-12"
                    placeholder="17.20"
                  />
                </div>
                <Button variant="secondary" onClick={applyExchangeRateToPreview} disabled={!preview}>
                  Actualizar valores
                </Button>
                <Button onClick={saveExchangeRate} disabled={updateExchangeRateMutation.isPending}>
                  Guardar tipo de cambio
                </Button>
              </div>
            </div>

            <div className="mt-5 flex gap-2">
              <Button onClick={confirmImport} disabled={!preview || confirmMutation.isPending}>
                Confirmar importación
              </Button>
              <Button
                variant="secondary"
                onClick={resetWorkspace}
                disabled={!preview && !result}
              >
                Limpiar
              </Button>
            </div>

            {errorMessage ? (
              <div className="mt-5 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                {errorMessage}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader
            title="Resultado / logs"
            description={preview?.source || 'Sin archivo procesado'}
            action={
              result ? (
                <Badge variant="success">{result.processed} aplicados</Badge>
              ) : preview ? (
                <Badge variant="info">{rows.length} listos</Badge>
              ) : null
            }
          />
          <CardContent className="space-y-3">
            {(result?.logs || []).map((log) => (
              <div key={`${log.category}-${log.serviceCode}`} className="flex items-start gap-3 rounded-2xl border border-[var(--color-border)] px-4 py-3">
                <div className="rounded-xl bg-[var(--color-panel-subtle)] p-2">
                  <FileSpreadsheet className="h-4 w-4 text-[var(--color-primary)]" />
                </div>
                <div className="flex-1">
                  <p className="font-medium">
                    {log.category} / {log.serviceCode}
                  </p>
                  <p className="mt-1 text-sm text-[var(--color-text-muted)]">{log.action}</p>
                </div>
                <Badge variant="success">OK</Badge>
              </div>
            ))}
            {!result && preview ? (
              <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel-subtle)] px-4 py-3 text-sm text-[var(--color-text-muted)]">
                Revisa y ajusta la tabla antes de confirmar la creación.
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {preview ? (
        <Card>
          <CardHeader title="Preview editable" description="Puedes ajustar manualmente cada fila en formato grid antes de importar." />
          <CardContent className="space-y-4">
            <div className="grid gap-4">
              {rows.map((row, rowIndex) => (
                <div key={`${row.serviceCode}-${rowIndex}`} className="rounded-[28px] border border-[var(--color-border)] bg-white p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-primary)]">
                        Fila {rowIndex + 1}
                      </p>
                      <h3 className="mt-2 text-lg font-semibold tracking-[-0.03em] text-[var(--color-text)]">
                        {row.serviceName || 'Servicio sin nombre'}
                      </h3>
                    </div>
                    <Badge variant="info">{row.serviceCode}</Badge>
                  </div>

                  <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <Input
                      value={row.categoryName}
                      onChange={(event) =>
                        setRows((current) =>
                          current.map((item, index) =>
                            index === rowIndex
                              ? {
                                  ...item,
                                  categoryName: event.target.value,
                                  categoryCode: event.target.value
                                    .normalize('NFD')
                                    .replace(/[\u0300-\u036f]/g, '')
                                    .toUpperCase()
                                    .replace(/[^A-Z0-9]+/g, '_')
                                    .replace(/^_+|_+$/g, ''),
                                }
                              : item,
                          ),
                        )
                      }
                      placeholder="Categoría"
                    />
                    <Input
                      value={row.unit || ''}
                      onChange={(event) =>
                        setRows((current) =>
                          current.map((item, index) =>
                            index === rowIndex ? { ...item, unit: event.target.value } : item,
                          ),
                        )
                      }
                      placeholder="Unidad"
                    />
                    <Input
                      value={row.suffix}
                      onChange={(event) =>
                        setRows((current) =>
                          current.map((item, index) =>
                            index === rowIndex
                              ? {
                                  ...item,
                                  suffix: event.target.value.toUpperCase().replace(/\s+/g, ''),
                                  serviceCode: `${event.target.value.toUpperCase().replace(/\s+/g, '')}${item.consecutive}`,
                                }
                              : item,
                          ),
                        )
                      }
                      placeholder="Sufijo"
                    />
                    <Input
                      value={row.consecutive}
                      onChange={(event) =>
                        setRows((current) =>
                          current.map((item, index) =>
                            index === rowIndex
                              ? {
                                  ...item,
                                  consecutive: event.target.value.toUpperCase().replace(/\s+/g, ''),
                                  serviceCode: `${item.suffix}${event.target.value.toUpperCase().replace(/\s+/g, '')}`,
                                }
                              : item,
                          ),
                        )
                      }
                      placeholder="Consecutivo"
                    />
                  </div>

                  <div className="mt-3 grid gap-3 md:grid-cols-[1fr_1.2fr]">
                    <Input
                      value={row.serviceCode}
                      onChange={(event) =>
                        setRows((current) =>
                          current.map((item, index) =>
                            index === rowIndex ? { ...item, serviceCode: event.target.value.toUpperCase() } : item,
                          ),
                        )
                      }
                      placeholder="Código de servicio"
                    />
                    <Input
                      value={row.serviceName}
                      onChange={(event) =>
                        setRows((current) =>
                          current.map((item, index) =>
                            index === rowIndex ? { ...item, serviceName: event.target.value } : item,
                          ),
                        )
                      }
                      placeholder="Nombre del servicio"
                    />
                  </div>

                  <div className="mt-3 grid gap-3 md:grid-cols-[1.4fr_220px]">
                    <Input
                      value={row.description || ''}
                      onChange={(event) =>
                        setRows((current) =>
                          current.map((item, index) =>
                            index === rowIndex ? { ...item, description: event.target.value } : item,
                          ),
                        )
                      }
                      placeholder="Descripción"
                    />
                    <Input
                      value={row.validFrom ? String(row.validFrom).slice(0, 10) : ''}
                      onChange={(event) =>
                        setRows((current) =>
                          current.map((item, index) =>
                            index === rowIndex ? { ...item, validFrom: event.target.value } : item,
                          ),
                        )
                      }
                      placeholder="Vigencia"
                    />
                  </div>

                  <div className="mt-3">
                    <Input
                      value={row.relatedWork || ''}
                      onChange={(event) =>
                        setRows((current) =>
                          current.map((item, index) =>
                            index === rowIndex ? { ...item, relatedWork: event.target.value } : item,
                          ),
                        )
                      }
                      placeholder="Trabajo relacionado"
                    />
                  </div>

                  <div className="mt-5">
                    <p className="text-sm font-medium text-[var(--color-text)]">Opciones</p>
                    <div className="mt-3 grid gap-3 xl:grid-cols-3">
                      {row.options.map((option, optionIndex) => (
                        <div key={`${option.code}-${optionIndex}`} className="rounded-2xl bg-[var(--color-panel-subtle)] p-4">
                          <div className="grid gap-2">
                            <Input
                              value={option.code}
                              onChange={(event) =>
                                setRows((current) =>
                                  current.map((item, index) =>
                                    index === rowIndex
                                      ? {
                                          ...item,
                                          options: item.options.map((entry, entryIndex) =>
                                            entryIndex === optionIndex
                                              ? { ...entry, code: event.target.value.toUpperCase() }
                                              : entry,
                                          ),
                                        }
                                      : item,
                                  ),
                                )
                              }
                          placeholder="Clave opción"
                            />
                            <Input
                              value={option.name}
                              onChange={(event) =>
                                setRows((current) =>
                                  current.map((item, index) =>
                                    index === rowIndex
                                      ? {
                                          ...item,
                                          options: item.options.map((entry, entryIndex) =>
                                            entryIndex === optionIndex
                                              ? { ...entry, name: event.target.value }
                                              : entry,
                                          ),
                                        }
                                      : item,
                                  ),
                                )
                              }
                              placeholder="Nombre opción"
                            />
                            <div className="relative">
                              <span className="pointer-events-none absolute left-4 top-3.5 text-sm text-[var(--color-text-muted)]">MXN</span>
                              <Input
                                value={String(option.mxnPrice)}
                                onChange={(event) =>
                                  setRows((current) =>
                                    current.map((item, index) =>
                                      index === rowIndex
                                        ? {
                                            ...item,
                                            options: item.options.map((entry, entryIndex) => {
                                              if (entryIndex !== optionIndex) {
                                                return entry;
                                              }
                                              const mxnPrice = parseMoney(event.target.value);
                                              const activeRate = parseMoney(exchangeRateInput) || preview.exchangeRate || 1;
                                              const usdPrice = truncateToTwoDecimals(
                                                mxnPrice / activeRate,
                                              );
                                              return { ...entry, mxnPrice, usdPrice };
                                            }),
                                          }
                                        : item,
                                    ),
                                  )
                                }
                                className="pl-14"
                                placeholder="Precio MXN"
                              />
                            </div>
                            <div className="relative">
                              <span className="pointer-events-none absolute left-4 top-3.5 text-sm text-[var(--color-text-muted)]">USD</span>
                              <Input
                                value={String(option.usdPrice)}
                                onChange={(event) =>
                                  setRows((current) =>
                                    current.map((item, index) =>
                                      index === rowIndex
                                        ? {
                                            ...item,
                                            options: item.options.map((entry, entryIndex) =>
                                              entryIndex === optionIndex
                                                ? { ...entry, usdPrice: parseMoney(event.target.value) }
                                                : entry,
                                            ),
                                          }
                                        : item,
                                    ),
                                  )
                                }
                                className="pl-14"
                                placeholder="Precio USD"
                              />
                            </div>
                          </div>
                          <p className="mt-3 text-xs text-[var(--color-text-muted)]">
                            {formatCurrency(option.mxnPrice, 'MXN')} · {formatCurrency(option.usdPrice, 'USD')}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
