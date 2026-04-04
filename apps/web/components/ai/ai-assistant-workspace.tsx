'use client';

import { useRouter } from 'next/navigation';
import { AlertTriangle, Bot, BriefcaseBusiness, PencilLine, Save, Sparkles, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  useAiCreateDeal,
  useAiFeedback,
  useAiSuggestQuote,
  useClients,
} from '@/lib/api/hooks';
import type { AiSuggestedQuoteResponse } from '@/lib/api/types';
import { formatCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { SectionHeading } from '@/components/ui/section-heading';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Toast } from '@/components/ui/toast';

const examplePrompt = 'Servicio a tablero CCM 8 secciones con pruebas completas';

type DraftSuggestion = {
  category: string;
  service: string;
  variables: Array<{ key: string; value: string }>;
  suggestedServices: Array<{ value: string }>;
  selectedItems: Array<{
    serviceId?: string | null;
    pricingProfileId?: string | null;
    service: string;
    model?: string | null;
    quantity: number;
    unit_price: number;
    total: number;
  }>;
  workItems: Array<{ value: string }>;
  feedbackNotes: string;
};

function toDraft(data: AiSuggestedQuoteResponse): DraftSuggestion {
  return {
    category: data.detected.category || '',
    service: data.detected.service || '',
    variables: Object.entries(data.detected.variables).map(([key, value]) => ({
      key,
      value: String(value),
    })),
    suggestedServices: data.suggested_items.length
      ? data.suggested_items.map((item) => ({ value: item.service }))
      : [{ value: '' }],
    selectedItems: data.suggested_items,
    workItems: data.suggested_work_items.length
      ? data.suggested_work_items.map((item) => ({ value: item }))
      : [{ value: '' }],
    feedbackNotes: '',
  };
}

function parseVariableValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const asNumber = Number(trimmed);
  return Number.isFinite(asNumber) && trimmed === String(asNumber) ? asNumber : trimmed;
}

export function AiAssistantWorkspace() {
  const router = useRouter();
  const clientsQuery = useClients();
  const suggestMutation = useAiSuggestQuote();
  const createDealMutation = useAiCreateDeal();
  const feedbackMutation = useAiFeedback();

  const [text, setText] = useState('');
  const [clientId, setClientId] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<DraftSuggestion | null>(null);
  const [toastMessage, setToastMessage] = useState<null | { title: string; description: string }>(null);

  useEffect(() => {
    if (suggestMutation.data) {
      setDraft(toDraft(suggestMutation.data));
      setIsEditing(false);
    }
  }, [suggestMutation.data]);

  async function suggestQuote() {
    if (!text.trim()) {
      return;
    }

    try {
      await suggestMutation.mutateAsync({ text: text.trim() });
    } catch (error) {
      setToastMessage({
        title: 'Sugerencia fallida',
        description: error instanceof Error ? error.message : 'No fue posible interpretar la solicitud.',
      });
    }
  }

  async function createDeal() {
    if (!text.trim() || !clientId) {
      return;
    }

    try {
      const result = await createDealMutation.mutateAsync({
        text: text.trim(),
        clientId,
        items: draft?.selectedItems
          .filter((item) => item.serviceId && item.pricingProfileId)
          .map((item) => ({
            serviceId: item.serviceId as string,
            pricingProfileId: item.pricingProfileId as string,
            quantity: item.quantity,
          })),
        workItems: draft?.workItems.map((item) => item.value.trim()).filter(Boolean),
      });

      setToastMessage({
        title: 'Cotización generada',
        description: `Se creó la cotización ${result.folio}.`,
      });
      router.push(`/quotations/new?edit=${result.quotationId}`);
    } catch (error) {
      setToastMessage({
        title: 'No fue posible crear la cotización',
        description: error instanceof Error ? error.message : 'La generación automática falló.',
      });
    }
  }

  async function saveFeedback() {
    if (!text.trim() || !suggestMutation.data || !draft) {
      return;
    }

    const variables = Object.fromEntries(
      draft.variables
        .map((entry) => [entry.key.trim(), parseVariableValue(entry.value)] as const)
        .filter(([key, value]) => key && value !== null),
    );

    const suggestedServices = draft.suggestedServices
      .map((entry) => entry.value.trim())
      .filter(Boolean);

    try {
      await feedbackMutation.mutateAsync({
        input: text.trim(),
        original: {
          category: suggestMutation.data.detected.category,
          service: suggestMutation.data.detected.service,
          variables: suggestMutation.data.detected.variables,
          suggested_services: suggestMutation.data.suggested_items.map((item) => item.service),
          confidence: suggestMutation.data.confidence,
        },
        corrected: {
          category: draft.category.trim() || null,
          service: draft.service.trim() || null,
          variables,
          suggested_services: suggestedServices,
          selected_items: draft.selectedItems.map((item) => ({
            service: item.service,
            quantity: item.quantity,
          })),
          suggested_work_items: draft.workItems.map((item) => item.value.trim()).filter(Boolean),
          notes: draft.feedbackNotes.trim() || null,
          confidence: Math.max(suggestMutation.data.confidence, 0.95),
        },
      });

      setToastMessage({
        title: 'Aprendizaje guardado',
        description: 'La corrección ya quedó disponible como regla local para próximas consultas similares.',
      });

      await suggestMutation.mutateAsync({ text: text.trim() });
    } catch (error) {
      setToastMessage({
        title: 'No fue posible guardar la corrección',
        description: error instanceof Error ? error.message : 'La retroalimentación falló.',
      });
    }
  }

  function updateVariable(index: number, field: 'key' | 'value', value: string) {
    setDraft((current) => {
      if (!current) {
        return current;
      }

      const next = [...current.variables];
      next[index] = { ...next[index], [field]: value };
      return { ...current, variables: next };
    });
  }

  function updateSuggestedService(index: number, value: string) {
    setDraft((current) => {
      if (!current) {
        return current;
      }

      const next = [...current.suggestedServices];
      next[index] = { value };
      return { ...current, suggestedServices: next };
    });
  }

  function removeSuggestedItem(index: number) {
    setDraft((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        selectedItems: current.selectedItems.filter((_, currentIndex) => currentIndex !== index),
        suggestedServices: current.suggestedServices.filter((_, currentIndex) => currentIndex !== index),
      };
    });
  }

  function updateWorkItem(index: number, value: string) {
    setDraft((current) => {
      if (!current) {
        return current;
      }

      const next = [...current.workItems];
      next[index] = { value };
      return { ...current, workItems: next };
    });
  }

  function removeWorkItem(index: number) {
    setDraft((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        workItems: current.workItems.filter((_, currentIndex) => currentIndex !== index),
      };
    });
  }

  const suggestion = suggestMutation.data;
  const totalEstimated = draft?.selectedItems.reduce((sum, item) => sum + item.total, 0) || 0;

  return (
    <div className="space-y-6">
      {toastMessage ? (
        <div className="fixed bottom-6 right-6 z-40">
          <Toast title={toastMessage.title} description={toastMessage.description} />
        </div>
      ) : null}

      <SectionHeading
        title="Asistente Inteligente"
        description="Resuelve primero con reglas locales aprendidas, usa IA solo cuando hace falta y permite corregir para mejorar la siguiente sugerencia."
        action={
          <Button onClick={suggestQuote} disabled={suggestMutation.isPending || !text.trim()}>
            <Sparkles className="h-4 w-4" />
            Generar sugerencia
          </Button>
        }
      />

      <Card>
        <CardHeader
          title="Describe el servicio"
          description="Escribe la solicitud en lenguaje natural. El motor normaliza, busca coincidencias aprendidas, consulta catálogo, revisa historial y arma una propuesta estructurada."
        />
        <CardContent className="space-y-4">
          <Textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={6}
            placeholder={examplePrompt}
          />
          <div className="grid gap-3 xl:grid-cols-[1fr_260px_auto]">
            <Select value={clientId} onChange={(event) => setClientId(event.target.value)}>
              <option value="">Selecciona cliente para crear cotización</option>
              {(clientsQuery.data || []).map((client) => (
                <option key={client.id} value={client.id}>
                  {client.legalName}
                </option>
              ))}
            </Select>
            <div className="rounded-[24px] bg-[var(--color-panel-subtle)] px-4 py-3 text-sm text-[var(--color-text-muted)]">
              Ejemplo: <span className="font-medium text-[var(--color-text)]">{examplePrompt}</span>
            </div>
            <Button
              onClick={createDeal}
              disabled={createDealMutation.isPending || !clientId || !draft?.selectedItems.length}
            >
              <BriefcaseBusiness className="h-4 w-4" />
              Crear cotización
            </Button>
          </div>
        </CardContent>
      </Card>

      {suggestMutation.isPending ? (
        <Card>
          <CardContent className="space-y-4 py-6">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-56 w-full" />
          </CardContent>
        </Card>
      ) : null}

      {suggestion && draft ? (
        <div className="space-y-6">
          {suggestion.needs_review ? (
            <div className="rounded-[28px] border border-[rgba(234,88,12,0.22)] bg-[rgba(255,237,213,0.8)] px-5 py-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 text-[rgb(194,65,12)]" />
                <div>
                  <p className="text-sm font-semibold text-[rgb(124,45,18)]">La sugerencia necesita revisión</p>
                  <p className="mt-1 text-sm text-[rgb(154,52,18)]">
                    {suggestion.missing_fields.length
                      ? `Faltan datos en: ${suggestion.missing_fields.join(', ')}.`
                      : 'La confianza todavía es baja para automatizar sin revisión.'}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {suggestion.catalog_updates.pending_count ? (
            <div className="rounded-[28px] border border-[rgba(14,116,144,0.16)] bg-[rgba(236,254,255,0.82)] px-5 py-4">
              <p className="text-sm font-semibold text-[rgb(21,94,117)]">
                Se detectaron {suggestion.catalog_updates.pending_count} servicios nuevos para catálogo
              </p>
              <p className="mt-1 text-sm text-[rgb(14,116,144)]">
                Revísalos en Catálogo para validarlos y complementar precio.
              </p>
              <p className="mt-2 text-sm text-[rgb(8,47,73)]">
                {suggestion.catalog_updates.detected_pending.join(' · ')}
              </p>
            </div>
          ) : null}

          <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
            <Card>
              <CardHeader
                title="Interpretación"
                description="Puedes editar la lectura técnica y guardarla como aprendizaje local si la respuesta no es correcta."
              />
              <CardContent className="space-y-4">
                <div className="rounded-[24px] bg-[var(--color-panel-subtle)] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-[var(--color-text)]">
                      <Bot className="h-4 w-4" />
                      Confianza {Math.round(suggestion.confidence * 100)}%
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <div className="rounded-full bg-white px-3 py-1 text-xs font-medium text-[var(--color-text)]">
                        Motor:{' '}
                        {suggestion.engine === 'openai'
                          ? 'OpenAI'
                          : suggestion.engine === 'local_learning'
                            ? 'Regla aprendida'
                            : 'Reglas locales'}
                      </div>
                      <div className="rounded-full bg-white px-3 py-1 text-xs font-medium text-[var(--color-text-muted)]">
                        Estado: {suggestion.ai_status}
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div>
                      <p className="text-xs uppercase tracking-[0.16em] text-[var(--color-text-faint)]">Categoría</p>
                      {isEditing ? (
                        <Input
                          className="mt-2"
                          value={draft.category}
                          onChange={(event) => setDraft((current) => (current ? { ...current, category: event.target.value } : current))}
                          placeholder="CCM, SWBG, BASE, METALC"
                        />
                      ) : (
                        <p className="mt-1 text-sm text-[var(--color-text)]">{suggestion.detected.category || 'Sin detectar'}</p>
                      )}
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.16em] text-[var(--color-text-faint)]">Servicio</p>
                      {isEditing ? (
                        <Input
                          className="mt-2"
                          value={draft.service}
                          onChange={(event) => setDraft((current) => (current ? { ...current, service: event.target.value } : current))}
                          placeholder="Servicio principal detectado"
                        />
                      ) : (
                        <p className="mt-1 text-sm text-[var(--color-text)]">{suggestion.detected.service || 'Sin detectar'}</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="rounded-[24px] border border-[var(--color-border)] bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-[var(--color-text)]">Variables detectadas</p>
                    {isEditing ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          setDraft((current) =>
                            current
                              ? {
                                  ...current,
                                  variables: [...current.variables, { key: '', value: '' }],
                                }
                              : current,
                          )
                        }
                      >
                        Agregar variable
                      </Button>
                    ) : null}
                  </div>
                  <div className="mt-3 space-y-2">
                    {isEditing ? (
                      draft.variables.map((entry, index) => (
                        <div key={`variable-${index}`} className="grid gap-2 md:grid-cols-[1fr_1fr]">
                          <Input
                            value={entry.key}
                            onChange={(event) => updateVariable(index, 'key', event.target.value)}
                            placeholder="variable"
                          />
                          <Input
                            value={entry.value}
                            onChange={(event) => updateVariable(index, 'value', event.target.value)}
                            placeholder="valor"
                          />
                        </div>
                      ))
                    ) : Object.keys(suggestion.detected.variables).length ? (
                      Object.entries(suggestion.detected.variables).map(([key, value]) => (
                        <div key={key} className="flex justify-between rounded-2xl bg-[var(--color-panel-subtle)] px-4 py-3 text-sm">
                          <span className="text-[var(--color-text-muted)]">{key}</span>
                          <span className="font-medium text-[var(--color-text)]">{String(value)}</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-[var(--color-text-muted)]">No se detectaron variables cuantificables.</p>
                    )}
                  </div>
                </div>

                <div className="rounded-[24px] border border-[var(--color-border)] bg-white p-4">
                  <p className="text-sm font-semibold text-[var(--color-text)]">Reglas aplicadas</p>
                  <div className="mt-3 space-y-2">
                    {suggestion.rules_applied.length ? (
                      suggestion.rules_applied.map((rule) => (
                        <div key={rule} className="rounded-2xl bg-[var(--color-panel-subtle)] px-4 py-3 text-sm text-[var(--color-text)]">
                          {rule}
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-[var(--color-text-muted)]">No se activaron reglas adicionales.</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader
                title="Cotización sugerida"
                description="Resultado estructurado con servicios del catálogo, historial relacionado y edición de aprendizaje."
              />
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-[var(--color-border)] bg-white p-4">
                  <div>
                    <p className="text-sm text-[var(--color-text-muted)]">Total estimado</p>
                    <p className="mt-1 text-2xl font-semibold text-[var(--color-text)]">{formatCurrency(totalEstimated, 'MXN')}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="secondary" onClick={() => setIsEditing((current) => !current)}>
                      <PencilLine className="h-4 w-4" />
                      {isEditing ? 'Cerrar edición' : 'Editar'}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setIsEditing(true)}
                    >
                      No es correcto
                    </Button>
                    {isEditing ? (
                      <Button
                        type="button"
                        onClick={saveFeedback}
                        disabled={feedbackMutation.isPending}
                      >
                        <Save className="h-4 w-4" />
                        Guardar aprendizaje
                      </Button>
                    ) : null}
                  </div>
                </div>

                <div className="space-y-3">
                    {isEditing ? (
                      draft.selectedItems.map((item, index) => (
                        <div key={`${item.service}-${index}`} className="grid gap-2 md:grid-cols-[1fr_auto]">
                          <Input
                            value={draft.suggestedServices[index]?.value || item.service}
                            onChange={(event) => updateSuggestedService(index, event.target.value)}
                            placeholder="Servicio sugerido"
                          />
                          <Button type="button" variant="ghost" size="icon" onClick={() => removeSuggestedItem(index)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))
                    ) : suggestion.suggested_items.length ? (
                    suggestion.suggested_items.map((item, index) => (
                      <div key={`${item.service}-${index}`} className="rounded-[24px] border border-[var(--color-border)] bg-[var(--color-panel-subtle)] p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="font-medium text-[var(--color-text)]">{item.service}</p>
                            <p className="mt-1 text-sm text-[var(--color-text-muted)]">{item.model || 'Modelo general'}</p>
                            <p className="mt-1 text-xs text-[var(--color-text-faint)]">Cantidad {item.quantity}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm text-[var(--color-text-muted)]">{formatCurrency(item.unit_price, 'MXN')} c/u</p>
                            <p className="mt-1 font-semibold text-[var(--color-text)]">{formatCurrency(item.total, 'MXN')}</p>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-[var(--color-text-muted)]">No se encontraron conceptos del catálogo suficientemente cercanos.</p>
                  )}

                  {isEditing ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        setDraft((current) =>
                          current
                            ? {
                                ...current,
                                suggestedServices: [...current.suggestedServices, { value: '' }],
                                selectedItems: [
                                  ...current.selectedItems,
                                  {
                                    service: '',
                                    quantity: 1,
                                    unit_price: 0,
                                    total: 0,
                                  },
                                ],
                              }
                            : current,
                        )
                      }
                    >
                      Agregar servicio sugerido
                    </Button>
                  ) : null}
                </div>

                <div className="rounded-[24px] border border-[var(--color-border)] bg-white p-4">
                  <p className="text-sm font-semibold text-[var(--color-text)]">Trabajos a realizar</p>
                  <div className="mt-3 space-y-2">
                    {isEditing ? (
                      draft.workItems.map((workItem, index) => (
                        <div key={`work-item-${index}`} className="grid gap-2 md:grid-cols-[1fr_auto]">
                          <Input
                            value={workItem.value}
                            onChange={(event) => updateWorkItem(index, event.target.value)}
                            placeholder="Trabajo a realizar"
                          />
                          <Button type="button" variant="ghost" size="icon" onClick={() => removeWorkItem(index)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))
                    ) : suggestion.suggested_work_items.length ? (
                      suggestion.suggested_work_items.map((workItem) => (
                        <div
                          key={workItem}
                          className="rounded-2xl bg-[var(--color-panel-subtle)] px-4 py-3 text-sm text-[var(--color-text)]"
                        >
                          {workItem}
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-[var(--color-text-muted)]">No se detectaron trabajos derivados del suministro sugerido.</p>
                    )}
                  </div>
                  {isEditing ? (
                    <div className="mt-3">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          setDraft((current) =>
                            current
                              ? {
                                  ...current,
                                  workItems: [...current.workItems, { value: '' }],
                                }
                              : current,
                          )
                        }
                      >
                        Agregar trabajo
                      </Button>
                    </div>
                  ) : null}
                </div>

                {isEditing ? (
                  <div className="rounded-[24px] border border-[var(--color-border)] bg-white p-4">
                    <p className="text-sm font-semibold text-[var(--color-text)]">Feedback en lenguaje natural</p>
                    <Textarea
                      className="mt-3"
                      rows={4}
                      value={draft.feedbackNotes}
                      onChange={(event) =>
                        setDraft((current) =>
                          current ? { ...current, feedbackNotes: event.target.value } : current,
                        )
                      }
                      placeholder="Ejemplo: no usamos configuración del relevador porque ya viene ajustado por fábrica, y tampoco aplica prueba con carga en este alcance."
                    />
                  </div>
                ) : null}

                <div className="rounded-[24px] border border-[var(--color-border)] bg-white p-4">
                  <p className="text-sm font-semibold text-[var(--color-text)]">Historial similar</p>
                  <div className="mt-3 space-y-2">
                    {suggestion.historical_references.length ? (
                      suggestion.historical_references.map((reference) => (
                        <div key={reference.id} className="rounded-2xl bg-[var(--color-panel-subtle)] px-4 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="font-medium text-[var(--color-text)]">{reference.folio}</p>
                              <p className="text-sm text-[var(--color-text-muted)]">{reference.title}</p>
                              <p className="text-xs text-[var(--color-text-faint)]">{reference.client}</p>
                            </div>
                            <p className="text-sm font-medium text-[var(--color-text)]">{Math.round(reference.similarity * 100)}%</p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-[var(--color-text-muted)]">No se encontraron cotizaciones históricas suficientemente parecidas.</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}
    </div>
  );
}
