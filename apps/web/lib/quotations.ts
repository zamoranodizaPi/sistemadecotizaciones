import type { KanbanResponse, QuotationListResponse, QuotationStatus } from '@/lib/api/types';

function normalizeCurrency(value?: string | null): 'MXN' | 'USD' {
  return value === 'USD' ? 'USD' : 'MXN';
}

export function mapQuotationsForUi(quotations: QuotationListResponse) {
  return quotations.map((quotation) => ({
    id: quotation.id,
    rootQuotationId: quotation.rootQuotationId,
    previousVersionId: quotation.previousVersionId,
    clientId: quotation.client.id,
    contactName: quotation.contactName || '',
    folio: quotation.folio,
    coverTitle: quotation.coverTitle || quotation.title,
    executiveSummary: quotation.executiveSummary || '',
    serviceType: quotation.serviceType || '',
    templateType: quotation.templateType || '',
    versionNumber: quotation.versionNumber,
    validUntil: quotation.validUntil
      ? new Date(quotation.validUntil).toLocaleDateString('es-MX', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        })
      : '',
    sentAt: quotation.sentAt || null,
    viewedAt: quotation.viewedAt || null,
    acceptedAt: quotation.acceptedAt || null,
    rejectedAt: quotation.rejectedAt || null,
    workOrderNumber: quotation.workOrderNumber || '',
    pricingRule: quotation.pricingRule || '',
    pricingRuleLabel: quotation.pricingRuleLabel || '',
    partCount: Number(quotation.partCount ?? 0),
    finalChargeRate: Number(quotation.finalChargeRate || 16),
    discountPercent: quotation.discountPercent ? Number(quotation.discountPercent) : 0,
    requiresApproval: Boolean(quotation.requiresApproval),
    approvalStatus: quotation.approvalStatus || 'NOT_REQUIRED',
    approvalReason: quotation.approvalReason || '',
    title: quotation.title,
    client: quotation.client.legalName,
    owner: quotation.createdBy?.name || 'Sin responsable',
    status: quotation.status,
    subtotal: Number(quotation.subtotal || 0),
    total: Number(quotation.total),
    currency: normalizeCurrency(quotation.currency),
    updatedAt: new Date(quotation.updatedAt).toLocaleDateString('es-MX', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }),
    updatedAtTime: new Date(quotation.updatedAt).toLocaleTimeString('es-MX', {
      hour: '2-digit',
      minute: '2-digit',
    }),
    createdAt: new Date(quotation.createdAt).toLocaleDateString('es-MX', {
      day: '2-digit',
      month: 'short',
    }),
    notes: quotation.notes || '',
    dueLabel:
      quotation.activities?.[0]?.description ||
      quotation.stage?.name ||
      quotation.notes ||
      'Sin actividad reciente',
    durationOfWork: quotation.durationOfWork || '',
    termsAndConditions: quotation.termsAndConditions || '',
    stage: quotation.stage?.name || quotation.status,
    probability: Number(quotation.stage?.probability || 0),
    activities: quotation.activities || [],
    items: quotation.items.length,
    lines: quotation.items.map((item) => ({
      id: item.id,
      serviceId: item.supplyId,
      pricingProfileId: item.pricingProfileId,
      serviceCode: item.supplyCode,
      serviceName: item.supplyName,
      categoryName: item.categoryName,
      pricingProfileName: item.pricingProfileName,
      partNumber: item.partNumber == null ? 0 : Number(item.partNumber),
      partQuantity: Number(item.partQuantity || 1),
      activityDays: Number(item.activityDays || 1),
      isOptional: Boolean(item.isOptional),
      optionGroup: item.optionGroup || '',
      optionLabel: item.optionLabel || '',
      exchangeRateUsed: item.exchangeRateUsed ? Number(item.exchangeRateUsed) : null,
      priceOriginCurrency: item.priceOriginCurrency,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
      totalPrice: Number(item.totalPrice),
      currency: normalizeCurrency(quotation.currency),
    })),
  }));
}

export function buildKanbanColumns(kanban: KanbanResponse) {
  return kanban.stages.map((stage) => ({
    id: stage.id,
    name: stage.name,
    code: stage.code as QuotationStatus,
    probability: Number(stage.probability),
    deals: stage.deals.map((deal) => ({
      id: deal.id,
      folio: deal.folio,
      title: deal.title,
      client: deal.client.legalName,
      total: Number(deal.total),
      currency: normalizeCurrency(deal.currency),
      forecastAmount: Number(deal.forecastAmount),
      owner: deal.createdBy?.name || 'Sin responsable',
      itemsCount: deal.itemsCount,
      lastActivity: deal.lastActivity,
      updatedAt: new Date(deal.updatedAt).toLocaleDateString('es-MX', {
        day: '2-digit',
        month: 'short',
      }),
    })),
  }));
}
