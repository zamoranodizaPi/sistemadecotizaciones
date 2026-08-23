'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { Download, Eye, FileText, Filter, Search, Sparkles, Trash2 } from 'lucide-react';
import {
  useConvertQuotationToWorkOrder,
  useDeleteQuotation,
  useDuplicateQuotation,
  useGeneratePdf,
  useGenerateSimplePdf,
  useGenerateSuggestedWordReport,
  useGenerateWordReport,
  useClients,
  useLearnQuotation,
  useMarkQuotationInteraction,
  useResolveQuotationApproval,
  useUpdateQuotation,
  useQuotations,
  useUpdateQuotationCommercial,
} from '@/lib/api/hooks';
import { mapQuotationsForUi } from '@/lib/quotations';
import { convertCurrencyAmount, formatCurrency } from '@/lib/utils';
import { useDisplaySettings } from '@/components/providers/display-settings-provider';
import { useSession } from '@/components/providers/session-provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Select } from '@/components/ui/select';
import { SectionHeading } from '@/components/ui/section-heading';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Toast } from '@/components/ui/toast';

function statusVariant(status: string) {
  switch (status) {
    case 'BORRADOR':
      return 'draft';
    case 'NUEVA':
      return 'new';
    case 'EN_PROCESO':
      return 'progress';
    case 'ENVIADA':
      return 'sent';
    case 'VISTA':
      return 'viewed';
    case 'NEGOCIACION':
      return 'negotiation';
    case 'ACEPTADA':
      return 'accepted';
    case 'RECHAZADA':
      return 'danger';
    case 'VENCIDA':
      return 'expired';
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

const CONTEXT_MENU_WIDTH = 260;
const CONTEXT_MENU_HEIGHT = 420;

export function QuotationsWorkspace() {
  const searchParams = useSearchParams();
  const { user } = useSession();
  const { displayCurrency, exchangeRate } = useDisplaySettings();
  const canDelete = user.displayRole === 'ADMIN';
  const canEdit = user.displayRole !== 'VIEWER';
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('ALL');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingCommercial, setEditingCommercial] = useState(false);
  const [editingDeal, setEditingDeal] = useState(false);
  const [durationOfWork, setDurationOfWork] = useState('');
  const [termsAndConditions, setTermsAndConditions] = useState('');
  const [dealTitle, setDealTitle] = useState('');
  const [dealNotes, setDealNotes] = useState('');
  const [dealClientId, setDealClientId] = useState('');
  const [dealContactName, setDealContactName] = useState('');
  const [columnWidths, setColumnWidths] = useState({
    folio: '140',
    cuenta: '170',
    estado: '120',
    vendedor: '150',
    actualizacion: '190',
    subtotal: '130',
    total: '130',
    acciones: '420',
  });
  const [contextMenu, setContextMenu] = useState<{
    quotationId: string;
    x: number;
    y: number;
  } | null>(null);
  const quotationsQuery = useQuotations();
  const clientsQuery = useClients();
  const pdfMutation = useGeneratePdf();
  const simplePdfMutation = useGenerateSimplePdf();
  const wordReportMutation = useGenerateWordReport();
  const suggestedWordReportMutation = useGenerateSuggestedWordReport();
  const learnMutation = useLearnQuotation();
  const deleteQuotationMutation = useDeleteQuotation();
  const duplicateQuotationMutation = useDuplicateQuotation();
  const interactionMutation = useMarkQuotationInteraction();
  const resolveApprovalMutation = useResolveQuotationApproval();
  const convertToWorkOrderMutation = useConvertQuotationToWorkOrder();
  const updateQuotationMutation = useUpdateQuotation();
  const commercialMutation = useUpdateQuotationCommercial();
  const [learningMessage, setLearningMessage] = useState<string | null>(null);

  const quotations = useMemo(
    () => (quotationsQuery.data ? mapQuotationsForUi(quotationsQuery.data) : []),
    [quotationsQuery.data],
  );

  const filtered = useMemo(() => {
    return quotations.filter((quotation) => {
      const matchesQuery =
        quotation.folio.toLowerCase().includes(query.toLowerCase()) ||
        quotation.client.toLowerCase().includes(query.toLowerCase());
      const matchesStatus = status === 'ALL' || quotation.status === status;
      return matchesQuery && matchesStatus;
    });
  }, [query, quotations, status]);

  const selectedQuotation =
    filtered.find((quotation) => quotation.id === selectedId) ||
    quotations.find((quotation) => quotation.id === selectedId);
  const selectedDealClient =
    (clientsQuery.data || []).find((client) => client.id === dealClientId) || null;
  const availableDealContacts = selectedDealClient?.contacts || [];
  const highlightedQuotationId = searchParams.get('selected');

  useEffect(() => {
    const selectedFromUrl = searchParams.get('selected');
    if (!selectedFromUrl) {
      return;
    }

    if (quotations.some((quotation) => quotation.id === selectedFromUrl)) {
      setSelectedId(selectedFromUrl);
    }
  }, [quotations, searchParams]);

  useEffect(() => {
    if (!selectedQuotation) {
      setEditingCommercial(false);
      setEditingDeal(false);
      setDurationOfWork('');
      setTermsAndConditions('');
      setDealTitle('');
      setDealNotes('');
      setDealClientId('');
      setDealContactName('');
      return;
    }

    setDurationOfWork(selectedQuotation.durationOfWork || '');
    setTermsAndConditions(selectedQuotation.termsAndConditions || '');
    setDealTitle(selectedQuotation.title || '');
    setDealNotes(selectedQuotation.notes || '');
    setDealClientId(selectedQuotation.clientId || '');
    setDealContactName(selectedQuotation.contactName || '');
  }, [selectedQuotation]);

  useEffect(() => {
    if (!selectedDealClient) {
      return;
    }

    if (!availableDealContacts.length) {
      return;
    }

    if (!dealContactName) {
      setDealContactName(availableDealContacts[0].fullName);
    }
  }, [availableDealContacts, dealContactName, selectedDealClient]);

  async function downloadPdf(id: string) {
    const response = await pdfMutation.mutateAsync(id);
    const link = document.createElement('a');
    link.href = `data:application/pdf;base64,${response.file}`;
    link.download = response.fileName;
    link.click();
  }

  async function downloadSimplePdf(id: string) {
    const response = await simplePdfMutation.mutateAsync(id);
    const link = document.createElement('a');
    link.href = `data:application/pdf;base64,${response.file}`;
    link.download = response.fileName;
    link.click();
  }

  async function downloadWordReport(id: string) {
    const response = await wordReportMutation.mutateAsync(id);
    const link = document.createElement('a');
    link.href = `data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,${response.file}`;
    link.download = response.fileName;
    link.click();
  }

  async function downloadSuggestedWordReport(id: string) {
    const response = await suggestedWordReportMutation.mutateAsync(id);
    const link = document.createElement('a');
    link.href = `data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,${response.file}`;
    link.download = response.fileName;
    link.click();
  }

  async function saveCommercialFields() {
    if (!selectedQuotation) {
      return;
    }

    await commercialMutation.mutateAsync({
      id: selectedQuotation.id,
      durationOfWork,
      termsAndConditions,
    });
    setEditingCommercial(false);
  }

  async function saveDealFields() {
    if (!selectedQuotation) {
      return;
    }

    await updateQuotationMutation.mutateAsync({
      id: selectedQuotation.id,
      clientId: dealClientId || undefined,
      contactName: dealContactName || undefined,
      title: dealTitle,
      notes: dealNotes || undefined,
    });
    setEditingDeal(false);
  }

  async function sendToLearning(id: string) {
    try {
      await learnMutation.mutateAsync(id);
      setLearningMessage('La cotización ya está en aprendizaje para mejorar futuras sugerencias.');
    } catch (error) {
      setLearningMessage(
        error instanceof Error ? error.message : 'No fue posible enviar la cotización a aprendizaje.',
      );
    }
  }

  useEffect(() => {
    if (!learningMessage) {
      return;
    }

    const timer = setTimeout(() => setLearningMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [learningMessage]);

  useEffect(() => {
    if (!contextMenu) {
      return;
    }

    function closeMenu() {
      setContextMenu(null);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setContextMenu(null);
      }
    }

    window.addEventListener('click', closeMenu);
    window.addEventListener('resize', closeMenu);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('click', closeMenu);
      window.removeEventListener('resize', closeMenu);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [contextMenu]);

  async function removeDeal() {
    if (!selectedQuotation || !canDelete) {
      return;
    }

    const password = window.prompt('Confirma tu contraseña de administrador para borrar esta cotización');
    if (!password) {
      return;
    }

    await deleteQuotationMutation.mutateAsync({
      id: selectedQuotation.id,
      password,
    });
    setSelectedId(null);
  }

  async function removeDealById(id: string) {
    if (!canDelete) {
      return;
    }

    const password = window.prompt('Confirma tu contraseña de administrador para borrar esta cotización');
    if (!password) {
      return;
    }

    await deleteQuotationMutation.mutateAsync({
      id,
      password,
    });

    if (selectedId === id) {
      setSelectedId(null);
    }
  }

  async function duplicateDeal(id: string) {
    await duplicateQuotationMutation.mutateAsync(id);
  }

  async function markInteraction(id: string, action: 'sent' | 'viewed' | 'accepted' | 'rejected') {
    await interactionMutation.mutateAsync({ id, action });
  }

  async function resolveApproval(id: string, decision: 'approve' | 'reject') {
    await resolveApprovalMutation.mutateAsync({ id, decision });
  }

  async function convertToWorkOrder(id: string) {
    await convertToWorkOrderMutation.mutateAsync(id);
  }

  function openContextMenu(event: MouseEvent, quotationId: string) {
    event.preventDefault();
    event.stopPropagation();
    const nextX = Math.max(12, Math.min(event.clientX, window.innerWidth - CONTEXT_MENU_WIDTH - 12));
    const nextY = Math.max(12, Math.min(event.clientY, window.innerHeight - CONTEXT_MENU_HEIGHT - 12));
    setContextMenu({
      quotationId,
      x: nextX,
      y: nextY,
    });
  }

  function resizeColumn(key: keyof typeof columnWidths, startX: number) {
    const initialWidth = Number(columnWidths[key] || 120);

    function onPointerMove(event: PointerEvent) {
      const nextWidth = Math.max(90, initialWidth + (event.clientX - startX));
      setColumnWidths((current) => ({
        ...current,
        [key]: String(nextWidth),
      }));
    }

    function onPointerUp() {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    }

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  }

  function closeContextMenu() {
    setContextMenu(null);
  }

  function renderQuotationActions(
    quotation: (typeof filtered)[number],
    mode: 'row' | 'context' = 'row',
  ) {
    const buttonClassName = mode === 'row' ? 'px-2 text-[11px]' : 'w-full justify-start px-3 text-xs';
    const contextItemClassName = 'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-[var(--color-text)] transition hover:bg-[var(--color-panel-subtle)]';

    return (
      <>
        {mode === 'context' ? (
          <button
            type="button"
            className={contextItemClassName}
            onClick={() => {
              setSelectedId(quotation.id);
              closeContextMenu();
            }}
          >
            <Eye className="h-4 w-4" />
            Preview
          </button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className={buttonClassName}
            onClick={() => {
              setSelectedId(quotation.id);
              closeContextMenu();
            }}
          >
            <Eye className="h-4 w-4" />
            Preview
          </Button>
        )}
        {mode === 'context' ? (
          <button
            type="button"
            className={contextItemClassName}
            onClick={() => {
              closeContextMenu();
              void downloadPdf(quotation.id);
            }}
          >
            <Download className="h-4 w-4" />
            PDF
          </button>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            className={buttonClassName}
            onClick={() => {
              closeContextMenu();
              void downloadPdf(quotation.id);
            }}
          >
            <Download className="h-4 w-4" />
            PDF
          </Button>
        )}
        {mode === 'context' ? (
          <button
            type="button"
            className={contextItemClassName}
            onClick={() => {
              closeContextMenu();
              void downloadSimplePdf(quotation.id);
            }}
          >
            <Download className="h-4 w-4" />
            PDF simple
          </button>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            className={buttonClassName}
            onClick={() => {
              closeContextMenu();
              void downloadSimplePdf(quotation.id);
            }}
          >
            <Download className="h-4 w-4" />
            PDF simple
          </Button>
        )}
        {quotation.status === 'ACEPTADA'
          ? mode === 'context' ? (
              <button
                type="button"
                className={contextItemClassName}
                onClick={() => {
                  closeContextMenu();
                  void downloadWordReport(quotation.id);
                }}
              >
                <Download className="h-4 w-4" />
                Word
              </button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                className={buttonClassName}
                onClick={() => {
                  closeContextMenu();
                  void downloadWordReport(quotation.id);
                }}
              >
                <Download className="h-4 w-4" />
                Word
              </Button>
            )
          : null}
        {quotation.status === 'ACEPTADA'
          ? mode === 'context' ? (
              <button
                type="button"
                className={contextItemClassName}
                onClick={() => {
                  closeContextMenu();
                  void downloadSuggestedWordReport(quotation.id);
                }}
              >
                <Download className="h-4 w-4" />
                Reporte sugerido
              </button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                className={buttonClassName}
                onClick={() => {
                  closeContextMenu();
                  void downloadSuggestedWordReport(quotation.id);
                }}
              >
                <Download className="h-4 w-4" />
                Reporte sugerido
              </Button>
            )
          : null}
        {canEdit ? (
          mode === 'context' ? (
            <Link
              href={`/quotations/new?edit=${quotation.id}`}
              onClick={() => closeContextMenu()}
              className={contextItemClassName}
            >
              <FileText className="h-4 w-4" />
              Editar
            </Link>
          ) : (
            <Link
              href={`/quotations/new?edit=${quotation.id}`}
              onClick={() => closeContextMenu()}
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-[var(--color-border)] bg-white px-2 text-[11px] text-[var(--color-text)] transition hover:bg-[var(--color-panel-subtle)]"
            >
              <FileText className="h-4 w-4" />
              Editar
            </Link>
          )
        ) : null}
        {canEdit ? (
          mode === 'context' ? (
            <button
              type="button"
              className={contextItemClassName}
              onClick={() => {
                closeContextMenu();
                void duplicateDeal(quotation.id);
              }}
            >
              <Sparkles className="h-4 w-4" />
              Versionar
            </button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              className={buttonClassName}
              onClick={() => {
                closeContextMenu();
                void duplicateDeal(quotation.id);
              }}
            >
              <Sparkles className="h-4 w-4" />
              Versionar
            </Button>
          )
        ) : null}
        {canEdit ? (
          mode === 'context' ? (
            <button
              type="button"
              className={contextItemClassName}
              onClick={() => {
                closeContextMenu();
                void markInteraction(quotation.id, 'sent');
              }}
            >
              Enviar
            </button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className={buttonClassName}
              onClick={() => {
                closeContextMenu();
                void markInteraction(quotation.id, 'sent');
              }}
            >
              Enviar
            </Button>
          )
        ) : null}
        {canEdit ? (
          mode === 'context' ? (
            <button
              type="button"
              className={contextItemClassName}
              onClick={() => {
                closeContextMenu();
                void markInteraction(quotation.id, 'viewed');
              }}
            >
              Vista
            </button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className={buttonClassName}
              onClick={() => {
                closeContextMenu();
                void markInteraction(quotation.id, 'viewed');
              }}
            >
              Vista
            </Button>
          )
        ) : null}
        {canEdit ? (
          mode === 'context' ? (
            <button
              type="button"
              className={contextItemClassName}
              onClick={() => {
                closeContextMenu();
                void markInteraction(quotation.id, 'accepted');
              }}
            >
              Aceptar
            </button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className={buttonClassName}
              onClick={() => {
                closeContextMenu();
                void markInteraction(quotation.id, 'accepted');
              }}
            >
              Aceptar
            </Button>
          )
        ) : null}
        {canEdit ? (
          mode === 'context' ? (
            <button
              type="button"
              className={contextItemClassName}
              onClick={() => {
                closeContextMenu();
                void convertToWorkOrder(quotation.id);
              }}
            >
              OT
            </button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className={buttonClassName}
              onClick={() => {
                closeContextMenu();
                void convertToWorkOrder(quotation.id);
              }}
            >
              OT
            </Button>
          )
        ) : null}
        {canEdit ? (
          mode === 'context' ? (
            <button
              type="button"
              className={contextItemClassName}
              onClick={() => {
                closeContextMenu();
                void sendToLearning(quotation.id);
              }}
              disabled={learnMutation.isPending}
            >
              <Sparkles className="h-4 w-4" />
              Aprender
            </button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className={buttonClassName}
              onClick={() => {
                closeContextMenu();
                void sendToLearning(quotation.id);
              }}
              disabled={learnMutation.isPending}
            >
              <Sparkles className="h-4 w-4" />
              Aprender
            </Button>
          )
        ) : null}
        {quotation.requiresApproval && user.displayRole === 'ADMIN' ? (
          mode === 'context' ? (
            <button
              type="button"
              className={contextItemClassName}
              onClick={() => {
                closeContextMenu();
                void resolveApproval(quotation.id, 'approve');
              }}
            >
              Aprobar desc.
            </button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className={buttonClassName}
              onClick={() => {
                closeContextMenu();
                void resolveApproval(quotation.id, 'approve');
              }}
            >
              Aprobar desc.
            </Button>
          )
        ) : null}
        {canDelete ? (
          mode === 'context' ? (
            <button
              type="button"
              className={contextItemClassName}
              onClick={() => {
                closeContextMenu();
                void removeDealById(quotation.id);
              }}
              disabled={deleteQuotationMutation.isPending}
            >
              <Trash2 className="h-4 w-4" />
              Eliminar
            </button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className={buttonClassName}
              onClick={() => {
                closeContextMenu();
                void removeDealById(quotation.id);
              }}
              disabled={deleteQuotationMutation.isPending}
            >
              <Trash2 className="h-4 w-4" />
              Eliminar
            </Button>
          )
        ) : null}
      </>
    );
  }

  if (quotationsQuery.isLoading) {
    return (
      <Card>
        <CardContent className="space-y-4 py-6">
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (quotationsQuery.isError) {
    return (
      <Card>
        <CardContent className="py-10">
          <p className="text-sm text-[var(--color-text-muted)]">No fue posible cargar las cotizaciones.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {commercialMutation.isSuccess ? (
        <div className="fixed bottom-6 right-6 z-40">
          <Toast
            title="Cotización actualizada"
            description="La duración de trabajos y términos quedaron guardados."
          />
        </div>
      ) : null}
      {learningMessage ? (
        <div className="fixed bottom-6 right-6 z-40">
          <Toast title="Aprendizaje" description={learningMessage} />
        </div>
      ) : null}

      <SectionHeading
        title="Cotizaciones"
        action={
          <div className="flex items-center gap-2">
            <Button variant="secondary">
              <Filter className="h-4 w-4" />
              Guardar vista
            </Button>
            {canEdit ? (
              <Link
                href="/quotations/new"
                className="inline-flex h-11 items-center justify-center rounded-2xl bg-[var(--color-primary)] px-4 text-sm font-medium text-white shadow-[0_18px_40px_rgba(249,115,22,0.24)] transition hover:bg-[var(--color-primary-strong)]"
              >
                Nueva cotización
              </Link>
            ) : null}
          </div>
        }
      />

      <Card>
        <CardHeader
          title=""
          description=""
        />
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[1fr_200px_200px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-3.5 h-4 w-4 text-[var(--color-text-faint)]" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="pl-10"
                placeholder="Buscar por folio o cliente"
              />
            </div>
            <Select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="ALL">Todos los estados</option>
              <option value="NUEVA">Nueva</option>
              <option value="EN_PROCESO">En proceso</option>
              <option value="ENVIADA">Enviada</option>
              <option value="VISTA">Vista</option>
              <option value="NEGOCIACION">Negociación</option>
              <option value="ACEPTADA">Aceptada</option>
              <option value="RECHAZADA">Rechazada</option>
              <option value="VENCIDA">Vencida</option>
              <option value="PAGADA">Pagada</option>
            </Select>
            <div className="flex items-center gap-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel-subtle)] px-4">
              <Sparkles className="h-4 w-4 text-[var(--color-primary)]" />
              <span className="text-sm text-[var(--color-text-muted)]">{filtered.length} resultados visibles</span>
            </div>
          </div>

          <div className="text-[11px]">
            <div className="overflow-x-auto rounded-[24px] border border-[var(--color-border)] bg-white">
              <table className="min-w-max table-fixed border-collapse text-left text-[11px]">
                <colgroup>
                  <col style={{ width: `${columnWidths.folio || 140}px` }} />
                  <col style={{ width: `${columnWidths.cuenta || 170}px` }} />
                  <col style={{ width: `${columnWidths.estado || 120}px` }} />
                  <col style={{ width: `${columnWidths.vendedor || 150}px` }} />
                  <col style={{ width: `${columnWidths.actualizacion || 190}px` }} />
                  <col style={{ width: `${columnWidths.subtotal || 130}px` }} />
                  <col style={{ width: `${columnWidths.total || 130}px` }} />
                  <col style={{ width: `${columnWidths.acciones || 420}px` }} />
                </colgroup>
                <thead className="bg-[var(--color-panel-subtle)] text-[var(--color-text-muted)]">
                  <tr>
                    {[
                      ['folio', 'Folio'],
                      ['cuenta', 'Cuenta'],
                      ['estado', 'Estado'],
                      ['vendedor', 'Vendedor'],
                      ['actualizacion', 'Actualización'],
                      ['subtotal', 'Subtotal'],
                      ['total', 'Total'],
                      ['acciones', 'Acciones'],
                    ].map(([key, label]) => (
                      <th key={key} className="relative px-4 py-3 font-medium">
                        <div className="pr-4">
                          <span>{label}</span>
                          <div
                            onPointerDown={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              resizeColumn(key as keyof typeof columnWidths, event.clientX);
                            }}
                            className="absolute right-0 top-0 flex h-full w-4 cursor-col-resize select-none items-center justify-center text-[var(--color-text-faint)] transition hover:bg-white hover:text-[var(--color-primary)]"
                            aria-label={`Ajustar columna ${label}`}
                            role="separator"
                          >
                            |
                          </div>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
            {filtered.map((quotation) => (
              <tr
                key={quotation.id}
                onContextMenu={(event) => openContextMenu(event, quotation.id)}
                className={`border-t border-[var(--color-border)] transition hover:bg-[var(--color-panel-subtle)] ${
                  quotation.id === highlightedQuotationId
                    ? 'bg-[color:rgba(249,115,22,0.10)] ring-1 ring-inset ring-[var(--color-primary)]'
                    : ''
                }`}
              >
                <td className="px-4 py-3 align-middle text-[var(--color-text)]">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium leading-none">{quotation.folio}</p>
                      {quotation.id === highlightedQuotationId ? (
                        <span className="rounded-full bg-[var(--color-primary)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white">
                          Recién creada
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
                      v{quotation.versionNumber} · {quotation.items} conceptos
                    </p>
                  </div>
                </td>
                <td className="px-4 py-3 align-middle text-[var(--color-text)]">
                  <p className="whitespace-nowrap">{quotation.client}</p>
                  <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
                    {quotation.serviceType || 'Sin tipo'}{quotation.validUntil ? ` · Vigencia ${quotation.validUntil}` : ''}
                  </p>
                </td>
                <td className="px-4 py-3 align-middle text-[var(--color-text)]">
                  <div className="flex flex-col gap-1">
                    <Badge variant={statusVariant(quotation.status)}>{quotation.status}</Badge>
                    {quotation.requiresApproval ? (
                      <Badge variant={quotation.approvalStatus === 'APPROVED' ? 'success' : quotation.approvalStatus === 'REJECTED' ? 'danger' : 'warning'}>
                        {quotation.approvalStatus === 'APPROVED'
                          ? 'Descuento aprobado'
                          : quotation.approvalStatus === 'REJECTED'
                            ? 'Descuento rechazado'
                            : 'Pendiente aprobación'}
                      </Badge>
                    ) : null}
                  </div>
                </td>
                <td className="whitespace-nowrap px-4 py-3 align-middle text-[var(--color-text)]">{quotation.owner}</td>
                <td className="px-4 py-3 align-middle text-[var(--color-text)]">
                  <p>{quotation.updatedAt}</p>
                  <p className="text-[11px] text-[var(--color-text-faint)]">{quotation.updatedAtTime}</p>
                </td>
                <td className="whitespace-nowrap px-4 py-3 align-middle font-medium text-[var(--color-text)]">
                  {formatCurrency(
                    convertCurrencyAmount(quotation.subtotal, quotation.currency, displayCurrency, exchangeRate),
                    displayCurrency,
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3 align-middle font-medium text-[var(--color-text)]">
                  {formatCurrency(
                    convertCurrencyAmount(quotation.total, quotation.currency, displayCurrency, exchangeRate),
                    displayCurrency,
                  )}
                </td>
                <td className="px-4 py-3 align-middle text-[var(--color-text)]">
                  <div className="flex flex-nowrap items-center gap-1">
                    {renderQuotationActions(quotation)}
                  </div>
                </td>
              </tr>
            ))}
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>

      {contextMenu ? (
        <div className="fixed inset-0 z-50" onClick={closeContextMenu} onContextMenu={(event) => event.preventDefault()}>
          <div
            className="fixed min-w-[260px] max-h-[420px] overflow-y-auto rounded-2xl border border-[var(--color-border)] bg-white p-2 shadow-[0_20px_60px_rgba(15,23,42,0.18)]"
            style={{
              left: contextMenu.x,
              top: contextMenu.y,
            }}
            onClick={(event) => event.stopPropagation()}
            onContextMenu={(event) => event.preventDefault()}
          >
            <p className="px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-faint)]">
              Acciones
            </p>
            <div className="flex flex-col gap-1">
              {(() => {
                const contextQuotation = quotations.find((quotation) => quotation.id === contextMenu.quotationId);
                return contextQuotation ? renderQuotationActions(contextQuotation, 'context') : null;
              })()}
            </div>
          </div>
        </div>
      ) : null}

      <Modal
        open={selectedId !== null}
        onClose={() => setSelectedId(null)}
        title={selectedQuotation ? `Vista previa ${selectedQuotation.folio}` : 'Vista previa'}
        description={selectedQuotation ? `${selectedQuotation.client} · ${selectedQuotation.title}` : undefined}
        className="max-w-6xl"
      >
        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-[28px] border border-[var(--color-border)] bg-[var(--color-panel-subtle)] p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-primary)]">Documento</p>
            <h4 className="mt-3 text-2xl font-semibold tracking-[-0.03em]">{selectedQuotation?.title}</h4>
            <div className="mt-6 space-y-3">
              {selectedQuotation?.lines.map((item) => (
                <div key={item.id} className="flex items-center justify-between rounded-2xl bg-white px-4 py-3">
                  <div>
                    <p className="font-medium">{item.serviceName}</p>
                    <p className="text-sm text-[var(--color-text-muted)]">{item.quantity} unidad(es)</p>
                  </div>
                  <p className="font-semibold">
                    {formatCurrency(
                      convertCurrencyAmount(item.totalPrice, item.currency, displayCurrency, exchangeRate),
                      displayCurrency,
                    )}
                  </p>
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-4">
            <Card>
              <CardHeader title="Resumen" description="Snapshot listo para compartir" />
            <CardContent className="space-y-4">
              <div className="rounded-3xl bg-[var(--color-panel-subtle)] p-4">
                <p className="text-sm text-[var(--color-text-muted)]">Total</p>
                  <p className="mt-1 text-3xl font-semibold tracking-[-0.04em]">
                    {selectedQuotation
                      ? formatCurrency(
                          convertCurrencyAmount(
                            selectedQuotation.total,
                            selectedQuotation.currency,
                            displayCurrency,
                            exchangeRate,
                          ),
                          displayCurrency,
                        )
                      : '-'}
                  </p>
                  <p className="mt-3 text-xs uppercase tracking-[0.16em] text-[var(--color-text-faint)]">Responsable</p>
                <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                  {selectedQuotation?.owner || 'Sin responsable'}
                </p>
              </div>
              <div className="rounded-3xl border border-dashed border-[var(--color-border)] p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-[var(--color-text-muted)]">Servicio</p>
                <p className="mt-1 text-sm text-[var(--color-text)]">
                  {selectedQuotation?.serviceType || 'Sin servicio'}
                </p>
                <p className="mt-4 text-xs uppercase tracking-[0.16em] text-[var(--color-text-muted)]">Resumen ejecutivo</p>
                <p className="mt-1 text-sm text-[var(--color-text)]">
                  {selectedQuotation?.executiveSummary || 'Sin resumen ejecutivo capturado.'}
                </p>
              </div>
                <Button className="w-full" onClick={() => selectedQuotation && downloadPdf(selectedQuotation.id)}>
                  Descargar PDF
                </Button>
                <Button variant="secondary" className="w-full" onClick={() => selectedQuotation && downloadSimplePdf(selectedQuotation.id)}>
                  Descargar PDF simplificado
                </Button>
                {selectedQuotation?.status === 'ACEPTADA' ? (
                  <Button variant="secondary" className="w-full" onClick={() => selectedQuotation && downloadWordReport(selectedQuotation.id)}>
                    Descargar Word
                  </Button>
                ) : null}
                {selectedQuotation?.status === 'ACEPTADA' ? (
                  <Button variant="secondary" className="w-full" onClick={() => selectedQuotation && downloadSuggestedWordReport(selectedQuotation.id)}>
                    Descargar reporte sugerido
                  </Button>
                ) : null}
                {canEdit ? (
                  <Button
                    variant="secondary"
                    className="w-full"
                    onClick={() => setEditingDeal(true)}
                  >
                    <FileText className="h-4 w-4" />
                    Editar cotización
                  </Button>
                ) : null}
                {canEdit ? (
                  <Button
                    variant="secondary"
                    className="w-full"
                    onClick={() => setEditingCommercial(true)}
                  >
                    <FileText className="h-4 w-4" />
                    Editar términos
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={() => selectedQuotation && sendToLearning(selectedQuotation.id)}
                  disabled={!selectedQuotation || learnMutation.isPending}
                >
                  <Sparkles className="h-4 w-4" />
                  Enviar a aprendizaje
                </Button>
                {canDelete ? (
                  <Button
                    variant="danger"
                    className="w-full"
                    onClick={removeDeal}
                    disabled={deleteQuotationMutation.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                    {deleteQuotationMutation.isPending ? 'Borrando...' : 'Borrar cotización'}
                  </Button>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader title="Bloques comerciales" description="Campos editables que alimentan el PDF" />
              <CardContent className="space-y-4">
                <div className="rounded-2xl bg-[var(--color-panel-subtle)] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-text-faint)]">
                    Duración de los trabajos
                  </p>
                  <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                    {selectedQuotation?.durationOfWork || 'Sin captura'}
                  </p>
                </div>
                <div className="rounded-2xl bg-[var(--color-panel-subtle)] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-text-faint)]">
                    Términos y condiciones
                  </p>
                  <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                    {selectedQuotation?.termsAndConditions || 'Sin captura'}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </Modal>

      <Modal
        open={editingDeal}
        onClose={() => setEditingDeal(false)}
        title={selectedQuotation ? `Editar cotización ${selectedQuotation.folio}` : 'Editar cotización'}
        description="Puedes actualizar cliente, contacto, título y notas sin salir de la tabla."
      >
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-sm font-medium text-[var(--color-text)]">Cliente</p>
            <Select value={dealClientId} onChange={(event) => setDealClientId(event.target.value)}>
              <option value="">Selecciona cliente</option>
              {clientsQuery.data?.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.legalName}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-[var(--color-text)]">Título</p>
            <Input value={dealTitle} onChange={(event) => setDealTitle(event.target.value)} placeholder="Título de la cotización" />
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-[var(--color-text)]">Nombre de contacto</p>
            <Input
              value={dealContactName}
              onChange={(event) => setDealContactName(event.target.value)}
              placeholder="Ej. Ing. Juan Pérez"
              list={availableDealContacts.length ? 'quotation-contact-options' : undefined}
            />
            {availableDealContacts.length ? (
              <datalist id="quotation-contact-options">
                {availableDealContacts.map((contact) => (
                  <option key={contact.id} value={contact.fullName} />
                ))}
              </datalist>
            ) : null}
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-[var(--color-text)]">Notas</p>
            <Textarea
              value={dealNotes}
              onChange={(event) => setDealNotes(event.target.value)}
              className="min-h-[140px]"
              placeholder="Notas operativas o comerciales"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditingDeal(false)}>
              Cancelar
            </Button>
            <Button onClick={saveDealFields} disabled={updateQuotationMutation.isPending || !dealTitle.trim()}>
              {updateQuotationMutation.isPending ? 'Guardando...' : 'Guardar cotización'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={editingCommercial}
        onClose={() => setEditingCommercial(false)}
        title={selectedQuotation ? `Editar bloques ${selectedQuotation.folio}` : 'Editar bloques'}
        description="Estos textos quedan guardados en la cotización y alimentan el PDF final."
      >
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-sm font-medium text-[var(--color-text)]">Duración de los trabajos</p>
            <Textarea
              value={durationOfWork}
              onChange={(event) => setDurationOfWork(event.target.value)}
              className="min-h-[140px]"
              placeholder="Describe duración estimada, dependencias y condiciones de ejecución."
            />
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-[var(--color-text)]">Términos y condiciones</p>
            <Textarea
              value={termsAndConditions}
              onChange={(event) => setTermsAndConditions(event.target.value)}
              className="min-h-[180px]"
              placeholder="Captura condiciones comerciales, validez, pagos y exclusiones."
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditingCommercial(false)}>
              Cancelar
            </Button>
            <Button onClick={saveCommercialFields} disabled={commercialMutation.isPending}>
              {commercialMutation.isPending ? 'Guardando...' : 'Guardar cambios'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
