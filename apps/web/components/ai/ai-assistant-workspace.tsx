'use client';

import { useRouter } from 'next/navigation';
import { AlertTriangle, Bot, BriefcaseBusiness, Check, Copy, PencilLine, Save, Sparkles, Trash2, WandSparkles, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  useAiCreateDeal,
  useAiFeedback,
  useCreateAiLearningPrompt,
  useAiSuggestQuote,
  useClients,
} from '@/lib/api/hooks';
import type { AiSuggestedQuoteResponse } from '@/lib/api/types';
import { formatCurrency } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
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
    decision: 'accepted' | 'rejected';
  }>;
  workItems: Array<{ value: string; decision: 'accepted' | 'rejected' }>;
  commercialText: string;
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
    selectedItems: data.suggested_items.map((item) => ({ ...item, decision: 'accepted' as const })),
    workItems: data.suggested_work_items.length
      ? data.suggested_work_items.map((item) => ({ value: item, decision: 'accepted' as const }))
      : [{ value: '', decision: 'accepted' as const }],
    commercialText: data.suggested_commercial_text || '',
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
  const createLearningPromptMutation = useCreateAiLearningPrompt();

  const [text, setText] = useState('');
  const [mode, setMode] = useState<'CATALOG_MATCH' | 'STRUCTURED_JSON'>('CATALOG_MATCH');
  const [clientId, setClientId] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<DraftSuggestion | null>(null);
  const [toastMessage, setToastMessage] = useState<null | { title: string; description: string }>(null);
  const [createdQuotation, setCreatedQuotation] = useState<null | { id: string; folio: string }>(null);
  const [lastAppliedRuleId, setLastAppliedRuleId] = useState<string | null>(null);

  useEffect(() => {
    if (!toastMessage) {
      return;
    }

    const timer = window.setTimeout(() => setToastMessage(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

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
      await suggestMutation.mutateAsync({ text: text.trim(), mode });
    } catch (error) {
      setToastMessage({
        title: 'Sugerencia fallida',
        description: error instanceof Error ? error.message : 'No fue posible interpretar la solicitud.',
      });
    }
  }

  async function rerunSuggestion() {
    if (!text.trim()) {
      return;
    }

    try {
      await suggestMutation.mutateAsync({ text: text.trim(), mode });
      setToastMessage({
        title: 'Sugerencia actualizada',
        description: 'Se regeneró la respuesta usando el aprendizaje más reciente disponible.',
      });
    } catch (error) {
      setToastMessage({
        title: 'No fue posible regenerar',
        description: error instanceof Error ? error.message : 'La actualización de la sugerencia falló.',
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
        mode,
        clientId,
        items: draft?.selectedItems
          .filter((item) => item.decision === 'accepted')
          .filter((item) => item.serviceId && item.pricingProfileId)
          .map((item) => ({
            serviceId: item.serviceId as string,
            pricingProfileId: item.pricingProfileId as string,
            quantity: item.quantity,
            unitPriceOverride: item.unit_price,
          })),
        workItems: draft?.workItems
          .filter((item) => item.decision === 'accepted')
          .map((item) => item.value.trim())
          .filter(Boolean),
        commercialText: draft?.commercialText.trim() || undefined,
      });

      setToastMessage({
        title: 'Cotización generada',
        description: `Se creó la cotización ${result.folio}.`,
      });
      setCreatedQuotation({
        id: result.quotationId,
        folio: result.folio,
      });
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
    const acceptedServices = draft.selectedItems
      .filter((item) => item.decision === 'accepted')
      .map((item) => item.service.trim())
      .filter(Boolean);
    const rejectedServices = draft.selectedItems
      .filter((item) => item.decision === 'rejected')
      .map((item) => item.service.trim())
      .filter(Boolean);
    const acceptedWorkItems = draft.workItems
      .filter((item) => item.decision === 'accepted')
      .map((item) => item.value.trim())
      .filter(Boolean);
    const rejectedWorkItems = draft.workItems
      .filter((item) => item.decision === 'rejected')
      .map((item) => item.value.trim())
      .filter(Boolean);

    try {
      await feedbackMutation.mutateAsync({
        input: text.trim(),
        mode,
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
          suggested_services: acceptedServices.length ? acceptedServices : suggestedServices,
          selected_items: draft.selectedItems.map((item) => ({
            service: item.service,
            quantity: item.quantity,
            decision: item.decision,
          })),
          suggested_work_items: acceptedWorkItems,
          rejected_services: rejectedServices,
          rejected_work_items: rejectedWorkItems,
          notes: draft.feedbackNotes.trim() || null,
          confidence: Math.max(suggestMutation.data.confidence, 0.95),
        },
      });

      setToastMessage({
        title: 'Aprendizaje guardado',
        description: 'La corrección ya quedó disponible como regla local para próximas consultas similares.',
      });
      setIsEditing(false);
    } catch (error) {
      setToastMessage({
        title: 'No fue posible guardar la corrección',
        description: error instanceof Error ? error.message : 'La retroalimentación falló.',
      });
    }
  }

  async function copyStructuredJson() {
    if (!suggestMutation.data?.structured_output) {
      return;
    }

    try {
      await navigator.clipboard.writeText(JSON.stringify(suggestMutation.data.structured_output, null, 2));
      setToastMessage({
        title: 'JSON copiado',
        description: 'La salida estructurada ya quedó en el portapapeles.',
      });
    } catch (error) {
      setToastMessage({
        title: 'No fue posible copiar',
        description: error instanceof Error ? error.message : 'La copia al portapapeles falló.',
      });
    }
  }

  async function convertStructuredToLearningPrompt() {
    if (!text.trim() || !suggestMutation.data?.structured_output) {
      return;
    }

    try {
      await createLearningPromptMutation.mutateAsync({
        mode: 'STRUCTURED_JSON',
        name: text.split('\n')[0]?.replace(/^titulo\s*:\s*/i, '').trim() || 'Caso estructurado',
        systemPrompt:
          'Genera una propuesta técnica estructurada en JSON usando el mismo formato del ejemplo. No devuelvas texto libre fuera del JSON.',
        inputExample: text.trim(),
        outputExample: JSON.stringify(suggestMutation.data.structured_output, null, 2),
        isActive: true,
        sortOrder: 0,
      });

      setToastMessage({
        title: 'Convertido a aprendizaje',
        description: 'La entrada y salida actual ya quedaron guardadas como prompt de entrenamiento JSON.',
      });
    } catch (error) {
      setToastMessage({
        title: 'No fue posible convertir',
        description: error instanceof Error ? error.message : 'La creación del prompt automático falló.',
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

  function setSuggestedItemDecision(index: number, decision: 'accepted' | 'rejected') {
    setDraft((current) => {
      if (!current) {
        return current;
      }

      const next = [...current.selectedItems];
      next[index] = { ...next[index], decision };
      return { ...current, selectedItems: next };
    });
    setIsEditing(true);
  }

  function updateWorkItem(index: number, value: string) {
    setDraft((current) => {
      if (!current) {
        return current;
      }

      const next = [...current.workItems];
      next[index] = { ...next[index], value };
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

  function setWorkItemDecision(index: number, decision: 'accepted' | 'rejected') {
    setDraft((current) => {
      if (!current) {
        return current;
      }

      const next = [...current.workItems];
      next[index] = { ...next[index], decision };
      return { ...current, workItems: next };
    });
    setIsEditing(true);
  }

  const suggestion = suggestMutation.data;
  const logPayload = suggestion
    ? {
        mode: suggestion.mode,
        detected: suggestion.detected,
        suggested_items: suggestion.suggested_items,
        suggested_work_items: suggestion.suggested_work_items,
        structured_output: suggestion.structured_output,
        historical_references: suggestion.historical_references,
        confidence: suggestion.confidence,
        engine: suggestion.engine,
        ai_status: suggestion.ai_status,
      }
    : null;
  useEffect(() => {
    const rule = suggestion?.applied_rule;
    if (!rule?.id) {
      setLastAppliedRuleId(null);
      return;
    }

    if (rule.id !== lastAppliedRuleId) {
      setLastAppliedRuleId(rule.id);
      setToastMessage({
        title: 'Regla local aplicada',
        description: `${rule.category || 'Regla local'} · ${rule.service || 'Servicio'}`,
      });
    }
  }, [suggestion?.applied_rule, lastAppliedRuleId]);

  async function copyLog() {
    if (!logPayload) {
      return;
    }

    try {
      await navigator.clipboard.writeText(JSON.stringify(logPayload, null, 2));
      setToastMessage({
        title: 'Log copiado',
        description: 'Los datos de la respuesta AI quedaron en el portapapeles.',
      });
    } catch (error) {
      setToastMessage({
        title: 'No fue posible copiar el log',
        description: error instanceof Error ? error.message : 'La copia falló.',
      });
    }
  }
  const acceptedItemsCount = draft?.selectedItems.filter((item) => item.decision === 'accepted').length || 0;
  const rejectedItemsCount = draft?.selectedItems.filter((item) => item.decision === 'rejected').length || 0;
  const acceptedWorkItemsCount = draft?.workItems.filter((item) => item.decision === 'accepted').length || 0;
  const rejectedWorkItemsCount = draft?.workItems.filter((item) => item.decision === 'rejected').length || 0;
  const totalEstimated = draft?.selectedItems
    .filter((item) => item.decision === 'accepted')
    .reduce((sum, item) => sum + item.total, 0) || 0;

  return (
    <div className="space-y-6">
      {toastMessage ? (
        <div className="fixed bottom-6 right-6 z-40">
          <Toast title={toastMessage.title} description={toastMessage.description} />
        </div>
      ) : null}

      {createdQuotation ? (
        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => router.push(`/quotations/new?edit=${createdQuotation.id}`)}
          >
            Ir a cotización {createdQuotation.folio}
          </Button>
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
          description="Elige el modo de trabajo. Usa catálogo para generar cotizaciones operativas; usa JSON estructurado para entrenar o explorar propuestas fuera del catálogo."
        />
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <Button type="button" variant={mode === 'CATALOG_MATCH' ? 'primary' : 'secondary'} onClick={() => setMode('CATALOG_MATCH')}>
              Matching con catálogo
            </Button>
            <Button type="button" variant={mode === 'STRUCTURED_JSON' ? 'primary' : 'secondary'} onClick={() => setMode('STRUCTURED_JSON')}>
              JSON estructurado
            </Button>
          </div>
          <Textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={6}
            placeholder={mode === 'CATALOG_MATCH' ? examplePrompt : 'titulo: Mantenimiento preventivo...\n\n{ "cliente": "...", "descripcion_trabajo": "..." }'}
          />
          <div className={`grid gap-3 ${mode === 'CATALOG_MATCH' ? 'xl:grid-cols-[1fr_260px_auto]' : 'xl:grid-cols-[1fr_260px]'}`}>
            <Select value={clientId} onChange={(event) => setClientId(event.target.value)}>
              <option value="">Selecciona cliente para crear cotización</option>
              {(clientsQuery.data || []).map((client) => (
                <option key={client.id} value={client.id}>
                  {client.legalName}
                </option>
              ))}
            </Select>
            <div className="rounded-[24px] bg-[var(--color-panel-subtle)] px-4 py-3 text-sm text-[var(--color-text-muted)]">
              Ejemplo: <span className="font-medium text-[var(--color-text)]">{mode === 'CATALOG_MATCH' ? examplePrompt : 'titulo + entrada JSON + salida JSON'}</span>
            </div>
            {mode === 'CATALOG_MATCH' ? (
              <Button
                onClick={createDeal}
                disabled={createDealMutation.isPending || !clientId || acceptedItemsCount === 0}
              >
                <BriefcaseBusiness className="h-4 w-4" />
                Crear cotización
              </Button>
            ) : null}
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

      {suggestion && draft && suggestion.mode === 'STRUCTURED_JSON' ? (
        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Salida JSON estructurada"
              description="Este modo usa prompts de entrenamiento orientados a propuestas JSON. No genera cotización operativa ni matching directo con catálogo."
            />
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-[var(--color-border)] bg-white p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-[var(--color-text)]">
                  <Bot className="h-4 w-4" />
                  Motor {suggestion.engine === 'openai' ? 'OpenAI' : suggestion.engine === 'local_learning' ? 'Regla aprendida' : 'Reglas locales'}
                </div>
                <div className="rounded-full bg-[var(--color-panel-subtle)] px-3 py-1 text-xs font-medium text-[var(--color-text-muted)]">
                  Estado: {suggestion.ai_status}
                </div>
              </div>
              <Textarea
                rows={20}
                readOnly
                value={JSON.stringify(suggestion.structured_output || {}, null, 2)}
              />
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" onClick={copyStructuredJson}>
                  <Copy className="h-4 w-4" />
                  Copiar JSON
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={convertStructuredToLearningPrompt}
                  disabled={createLearningPromptMutation.isPending}
                >
                  <WandSparkles className="h-4 w-4" />
                  Convertir a prompt
                </Button>
                <Button type="button" variant="secondary" onClick={() => setIsEditing((current) => !current)}>
                  <PencilLine className="h-4 w-4" />
                  {isEditing ? 'Cerrar edición' : 'Editar feedback'}
                </Button>
                {isEditing ? (
                  <Button type="button" onClick={saveFeedback} disabled={feedbackMutation.isPending}>
                    <Save className="h-4 w-4" />
                    Guardar aprendizaje
                  </Button>
                ) : null}
              </div>
              {isEditing ? (
                <div className="rounded-[24px] border border-[var(--color-border)] bg-white p-4">
                  <p className="text-sm font-semibold text-[var(--color-text)]">Feedback en lenguaje natural</p>
                  <Textarea
                    className="mt-3"
                    rows={5}
                    value={draft.feedbackNotes}
                    onChange={(event) => setDraft((current) => (current ? { ...current, feedbackNotes: event.target.value } : current))}
                    placeholder="Explica qué estructura JSON quieres conservar o corregir."
                  />
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      ) : suggestion && draft ? (
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
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge variant="success">{acceptedItemsCount} suministros aceptados</Badge>
                      {rejectedItemsCount ? <Badge variant="danger">{rejectedItemsCount} suministros rechazados</Badge> : null}
                      <Badge variant="success">{acceptedWorkItemsCount} actividades aceptadas</Badge>
                      {rejectedWorkItemsCount ? <Badge variant="danger">{rejectedWorkItemsCount} actividades rechazadas</Badge> : null}
                    </div>
                  </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={rerunSuggestion}
                    disabled={suggestMutation.isPending || !text.trim()}
                  >
                    <Sparkles className="h-4 w-4" />
                    Volver a generar
                  </Button>
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
                    {draft.selectedItems.length ? (
                    draft.selectedItems.map((item, index) => (
                      <div
                        key={`${item.service}-${index}`}
                        className={`rounded-[24px] border p-4 ${
                          item.decision === 'rejected'
                            ? 'border-[rgba(239,68,68,0.22)] bg-[rgba(254,242,242,0.82)] opacity-70'
                            : 'border-[rgba(34,197,94,0.24)] bg-[rgba(240,253,244,0.88)]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="font-medium text-[var(--color-text)]">{item.service}</p>
                            <div className="mt-2">
                              <Badge variant={item.decision === 'accepted' ? 'success' : 'danger'}>
                                {item.decision === 'accepted' ? 'Aceptado' : 'Rechazado'}
                              </Badge>
                            </div>
                            <p className="mt-1 text-sm text-[var(--color-text-muted)]">{item.model || 'Modelo general'}</p>
                            <p className="mt-1 text-xs text-[var(--color-text-faint)]">Cantidad {item.quantity}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm text-[var(--color-text-muted)]">{formatCurrency(item.unit_price, 'MXN')} c/u</p>
                            <p className="mt-1 font-semibold text-[var(--color-text)]">{formatCurrency(item.total, 'MXN')}</p>
                            <div className="mt-3 flex flex-wrap justify-end gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant={item.decision === 'accepted' ? 'primary' : 'secondary'}
                                onClick={() => setSuggestedItemDecision(index, 'accepted')}
                                disabled={item.decision === 'accepted'}
                              >
                                <Check className="h-4 w-4" />
                                {item.decision === 'accepted' ? 'Aceptado' : 'Aceptar'}
                              </Button>
                              <Button type="button" size="sm" variant={item.decision === 'rejected' ? 'danger' : 'secondary'} onClick={() => setSuggestedItemDecision(index, 'rejected')}>
                                <X className="h-4 w-4" />
                                Rechazar
                              </Button>
                              {isEditing ? (
                                <Button type="button" variant="ghost" size="icon" onClick={() => removeSuggestedItem(index)}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              ) : null}
                            </div>
                            <p className="mt-2 text-xs text-[var(--color-text-muted)]">
                              {item.decision === 'accepted'
                                ? 'Este suministro sí se incluirá al crear la cotización.'
                                : 'Este suministro no se incluirá y puede usarse como feedback para futuras sugerencias.'}
                            </p>
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
                                    decision: 'accepted',
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
                    {draft.workItems.length ? (
                      draft.workItems.map((workItem, index) => (
                        <div
                          key={`work-item-${index}`}
                          className={`rounded-2xl border px-4 py-3 ${
                            workItem.decision === 'rejected'
                              ? 'border-[rgba(239,68,68,0.22)] bg-[rgba(254,242,242,0.82)] opacity-70'
                              : 'border-[rgba(34,197,94,0.24)] bg-[rgba(240,253,244,0.88)]'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <>
                                <p className="text-sm text-[var(--color-text)]">{workItem.value}</p>
                                <div className="mt-2">
                                  <Badge variant={workItem.decision === 'accepted' ? 'success' : 'danger'}>
                                    {workItem.decision === 'accepted' ? 'Aceptada' : 'Rechazada'}
                                  </Badge>
                                </div>
                              </>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant={workItem.decision === 'accepted' ? 'primary' : 'secondary'}
                                onClick={() => setWorkItemDecision(index, 'accepted')}
                                disabled={workItem.decision === 'accepted'}
                              >
                                <Check className="h-4 w-4" />
                                {workItem.decision === 'accepted' ? 'Aceptado' : 'Aceptar'}
                              </Button>
                              <Button type="button" size="sm" variant={workItem.decision === 'rejected' ? 'danger' : 'secondary'} onClick={() => setWorkItemDecision(index, 'rejected')}>
                                <X className="h-4 w-4" />
                                Rechazar
                              </Button>
                              {isEditing ? (
                                <Button type="button" variant="ghost" size="icon" onClick={() => removeWorkItem(index)}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              ) : null}
                            </div>
                          </div>
                          <p className="mt-2 text-xs text-[var(--color-text-muted)]">
                            {workItem.decision === 'accepted'
                              ? 'Esta actividad sí se incluirá en la propuesta.'
                              : 'Esta actividad quedará fuera y servirá como corrección para próximas sugerencias.'}
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-[var(--color-text-muted)]">No se detectaron trabajos derivados del suministro sugerido.</p>
                    )}
                  </div>
                </div>

                <div className="rounded-[24px] border border-[var(--color-border)] bg-white p-4">
                  <p className="text-sm font-semibold text-[var(--color-text)]">Texto comercial editable</p>
                  <Textarea
                    className="mt-3"
                    rows={6}
                    value={isEditing ? draft.commercialText : suggestion.suggested_commercial_text}
                    onChange={(event) =>
                      setDraft((current) =>
                        current ? { ...current, commercialText: event.target.value } : current,
                      )
                    }
                    placeholder="Aquí se mostrarán notas, condiciones, tiempos o texto comercial que no forma parte de las actividades."
                    readOnly={!isEditing}
                  />
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

      {logPayload ? (
        <Card>
          <CardHeader
            title="Registro de salida"
            description="Aquí puedes ver exactamente la respuesta técnica detrás de la sugerencia generada para compartirla con soporte o guardarla en auditoría."
          />
          <CardContent className="space-y-3">
            <Textarea rows={10} readOnly value={JSON.stringify(logPayload, null, 2)} />
            <div className="flex justify-end">
              <Button type="button" variant="secondary" onClick={copyLog}>
                <Copy className="h-4 w-4" />
                Copiar log
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
