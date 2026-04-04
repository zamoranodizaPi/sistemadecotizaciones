'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiDeleteWithBody, apiGet, apiPatch, apiPost } from './client';
import type {
  ActivityResponse,
  AiCreateDealResponse,
  AiFeedbackResponse,
  AiSuggestedQuoteResponse,
  AssignableUserResponse,
  AuthUser,
  CatalogResponse,
  ClientResponse,
  DashboardMetricsResponse,
  ExchangeRateResponse,
  ExportCatalogResponse,
  ImportConfirmResponse,
  ImportPreviewResponse,
  KanbanResponse,
  LoginResponse,
  PdfResponse,
  PipelineResponse,
  QuotationListResponse,
  ReusableTextBlockResponse,
  ServiceTemplateResponse,
  SpecialConsiderationCatalogResponse,
  QuotationTemplateResponse,
  QuotationStatus,
  WorkItemCatalogEntry,
  WorkItemCatalogResponse,
} from './types';

export function useLogin() {
  return useMutation({
    mutationFn: (payload: { email: string; password: string }) =>
      apiPost<LoginResponse>('/auth/login', payload),
  });
}

export function useCurrentUser(enabled = true) {
  return useQuery({
    queryKey: ['auth-me'],
    queryFn: () => apiGet<AuthUser>('/auth/me'),
    enabled,
    retry: false,
  });
}

export function useUsers(enabled = true) {
  return useQuery({
    queryKey: ['users'],
    queryFn: () => apiGet<AuthUser[]>('/auth/users'),
    enabled,
  });
}

export function useAssignableUsers(enabled = true) {
  return useQuery({
    queryKey: ['assignable-users'],
    queryFn: () => apiGet<AssignableUserResponse>('/auth/users/assignable'),
    enabled,
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: {
      name: string;
      email: string;
      password: string;
      role: 'ADMIN' | 'EDITOR' | 'VIEWER';
    }) => apiPost<AuthUser>('/auth/users', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['assignable-users'] });
    },
  });
}

export function useDashboardMetrics() {
  return useQuery({
    queryKey: ['dashboard-metrics'],
    queryFn: () => apiGet<DashboardMetricsResponse>('/metrics/dashboard'),
  });
}

export function useAiSuggestQuote() {
  return useMutation({
    mutationFn: (payload: { text: string }) =>
      apiPost<AiSuggestedQuoteResponse>('/ai/suggest-quote', payload),
  });
}

export function useAiCreateDeal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: { text: string; clientId: string; title?: string }) =>
      apiPost<AiCreateDealResponse>('/ai/create-deal', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotations'] });
      queryClient.invalidateQueries({ queryKey: ['kanban'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
    },
  });
}

export function useAiFeedback() {
  return useMutation({
    mutationFn: (payload: {
      input: string;
      original: Record<string, unknown>;
      corrected: Record<string, unknown>;
    }) => apiPost<AiFeedbackResponse>('/ai/feedback', payload),
  });
}

export function useCatalog() {
  return useQuery({
    queryKey: ['catalog'],
    queryFn: () => apiGet<CatalogResponse>('/catalog'),
  });
}

function invalidateCatalog(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['catalog'] });
}

export function useBootstrapPricingProfiles() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => apiPost('/catalog/pricing-profiles/bootstrap'),
    onSuccess: () => {
      invalidateCatalog(queryClient);
    },
  });
}

export function useCreateCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: { code: string; name: string; description?: string }) =>
      apiPost('/catalog/categories', payload),
    onSuccess: () => {
      invalidateCatalog(queryClient);
    },
  });
}

export function useCreateService() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: {
      categoryCode: string;
      serviceCode: string;
      name: string;
      description?: string;
      unit?: string;
      relatedWork?: string;
      price?: number;
      source?: string;
    }) => apiPost('/catalog/services', payload),
    onSuccess: () => {
      invalidateCatalog(queryClient);
    },
  });
}

export function useCloneService() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      serviceId,
      code,
      name,
      categoryCode,
      description,
      unit,
      relatedWork,
    }: {
      serviceId: string;
      code: string;
      name: string;
      categoryCode?: string;
      description?: string;
      unit?: string;
      relatedWork?: string;
    }) =>
      apiPost(`/catalog/services/${serviceId}/clone`, {
        code,
        name,
        categoryCode,
        description,
        unit,
        relatedWork,
      }),
    onSuccess: () => {
      invalidateCatalog(queryClient);
    },
  });
}

export function useUpdateService() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      serviceId,
      code,
      name,
      description,
      unit,
      relatedWork,
    }: {
      serviceId: string;
      code: string;
      name: string;
      description?: string;
      unit?: string;
      relatedWork?: string;
    }) =>
      apiPatch(`/catalog/services/${serviceId}`, {
        code,
        name,
        description,
        unit,
        relatedWork,
      }),
    onSuccess: () => {
      invalidateCatalog(queryClient);
    },
  });
}

export function useUpdatePricingProfiles() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      serviceId,
      profiles,
    }: {
      serviceId: string;
      profiles: Array<{
        id?: string;
        code: string;
        name: string;
        sortOrder?: number;
        mxnPrice?: number;
        usdPrice?: number;
        validFrom?: string;
        source?: string;
      }>;
    }) =>
      apiPatch(`/catalog/services/${serviceId}/pricing-profiles`, {
        profiles,
      }),
    onSuccess: () => {
      invalidateCatalog(queryClient);
    },
  });
}

export function useExchangeRate() {
  return useQuery({
    queryKey: ['exchange-rate'],
    queryFn: () => apiGet<ExchangeRateResponse>('/catalog/exchange-rate'),
  });
}

export function useRefreshExchangeRate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => apiPost<ExchangeRateResponse>('/catalog/exchange-rate/refresh'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exchange-rate'] });
    },
  });
}

export function useUpdateExchangeRate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (rate: number) =>
      apiPatch<ExchangeRateResponse>('/catalog/exchange-rate', { rate }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exchange-rate'] });
    },
  });
}

export function useDeleteService() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      serviceId,
      password,
    }: {
      serviceId: string;
      password: string;
    }) => apiDeleteWithBody(`/catalog/services/${serviceId}`, { password }),
    onSuccess: () => {
      invalidateCatalog(queryClient);
    },
  });
}

export function useDeleteCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      categoryId,
      password,
    }: {
      categoryId: string;
      password: string;
    }) => apiDeleteWithBody(`/catalog/categories/${categoryId}`, { password }),
    onSuccess: () => {
      invalidateCatalog(queryClient);
    },
  });
}

export function useClearCatalog() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (password: string) => apiDeleteWithBody('/catalog', { password }),
    onSuccess: () => {
      invalidateCatalog(queryClient);
    },
  });
}

export function useClients() {
  return useQuery({
    queryKey: ['clients'],
    queryFn: () => apiGet<ClientResponse>('/clients'),
  });
}

export function useCreateClient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: {
      legalName: string;
      commercialName?: string;
      rfc: string;
      address?: string;
      contacts: Array<{
        fullName: string;
        email?: string;
        phone?: string;
        position?: string;
      }>;
    }) => apiPost('/clients', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
    },
  });
}

export function useUpdateClient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      legalName,
      commercialName,
      rfc,
      address,
      contacts,
    }: {
      id: string;
      legalName: string;
      commercialName?: string;
      rfc: string;
      address?: string;
      contacts: Array<{
        fullName: string;
        email?: string;
        phone?: string;
        position?: string;
      }>;
    }) =>
      apiPatch(`/clients/${id}`, {
        legalName,
        commercialName,
        rfc,
        address,
        contacts,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
    },
  });
}

export function useCloneClient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      legalName,
      commercialName,
      rfc,
      address,
    }: {
      id: string;
      legalName: string;
      commercialName?: string;
      rfc: string;
      address?: string;
    }) =>
      apiPost(`/clients/${id}/clone`, {
        legalName,
        commercialName,
        rfc,
        address,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
    },
  });
}

export function useDeleteClient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      apiDeleteWithBody(`/clients/${id}`, { password }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
    },
  });
}

export function useQuotations() {
  return useQuery({
    queryKey: ['quotations'],
    queryFn: () => apiGet<QuotationListResponse>('/quotations'),
  });
}

export function useKanban() {
  return useQuery({
    queryKey: ['kanban'],
    queryFn: () => apiGet<KanbanResponse>('/pipeline/kanban'),
  });
}

export function usePipelineSummary() {
  return useQuery({
    queryKey: ['pipeline-summary'],
    queryFn: () => apiGet<PipelineResponse>('/pipeline'),
  });
}

export function useCreateQuotation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: {
      clientId: string;
      createdById?: string;
      title: string;
      coverTitle?: string;
      executiveSummary?: string;
      serviceType?: string;
      templateType?: string;
      pricingRule?: string;
      validityDays?: number;
      reusableBlockIds?: string[];
      notes?: string;
      durationOfWork?: string;
      termsAndConditions?: string;
      commercialSections?: Array<{ title: string; content: string }>;
      specialConsiderations?: Array<
        | {
            type: 'PERCENTAGE';
            concept?: string;
            quantity?: number;
            percentage?: number;
            mxnAmount?: number;
            usdAmount?: number;
            sortOrder?: number;
          }
        | { type: 'TRAVEL'; location?: string; mxnAmount?: number; usdAmount?: number; sortOrder?: number }
      >;
      currency?: string;
      exchangeRate?: number;
      items: Array<{
        serviceId: string;
        pricingProfileId: string;
        quantity: number;
        unitPriceOverride?: number;
        isOptional?: boolean;
        optionGroup?: string;
        optionLabel?: string;
      }>;
    }) => apiPost('/quotations', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotations'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] });
      queryClient.invalidateQueries({ queryKey: ['kanban'] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['special-consideration-catalog'] });
      queryClient.invalidateQueries({ queryKey: ['service-templates'] });
      queryClient.invalidateQueries({ queryKey: ['work-item-catalog'] });
    },
  });
}

export function useQuotationTemplate() {
  return useQuery({
    queryKey: ['quotation-template'],
    queryFn: () => apiGet<QuotationTemplateResponse>('/quotations/template'),
  });
}

export function useSpecialConsiderationCatalog() {
  return useQuery({
    queryKey: ['special-consideration-catalog'],
    queryFn: () =>
      apiGet<SpecialConsiderationCatalogResponse>('/quotations/special-considerations/catalog'),
  });
}

export function useServiceTemplates() {
  return useQuery({
    queryKey: ['service-templates'],
    queryFn: () => apiGet<ServiceTemplateResponse>('/quotations/service-templates'),
  });
}

export function useWorkItemCatalog() {
  return useQuery({
    queryKey: ['work-item-catalog'],
    queryFn: () => apiGet<WorkItemCatalogResponse>('/quotations/work-items/catalog'),
  });
}

export function useReusableTextBlocks() {
  return useQuery({
    queryKey: ['reusable-text-blocks'],
    queryFn: () => apiGet<ReusableTextBlockResponse>('/quotations/reusable-text-blocks'),
  });
}

export function useCreateReusableTextBlock() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: { name: string; type: string; content: string }) =>
      apiPost('/quotations/reusable-text-blocks', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reusable-text-blocks'] });
    },
  });
}

export function useUpdateReusableTextBlock() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, name, type, content }: { id: string; name: string; type: string; content: string }) =>
      apiPatch(`/quotations/reusable-text-blocks/${id}`, { name, type, content }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reusable-text-blocks'] });
    },
  });
}

export function useDeleteReusableTextBlock() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiDelete(`/quotations/reusable-text-blocks/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reusable-text-blocks'] });
    },
  });
}

export function useCreateWorkItemCatalog() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: { name: string }) =>
      apiPost<WorkItemCatalogEntry>('/quotations/work-items/catalog', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-item-catalog'] });
    },
  });
}

export function useUpdateWorkItemCatalog() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      apiPatch<WorkItemCatalogEntry>(`/quotations/work-items/catalog/${id}`, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-item-catalog'] });
    },
  });
}

export function useDeleteWorkItemCatalog() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiDelete<WorkItemCatalogEntry>(`/quotations/work-items/catalog/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-item-catalog'] });
    },
  });
}

export function useUpdateQuotationTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (sections: Array<{ title: string; content: string }>) =>
      apiPatch<QuotationTemplateResponse>('/quotations/template', { sections }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotation-template'] });
    },
  });
}

export function useMoveQuotation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: QuotationStatus }) =>
      apiPatch(`/quotations/${id}/status/${status}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotations'] });
      queryClient.invalidateQueries({ queryKey: ['kanban'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] });
    },
  });
}

export function useUpdateQuotation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      clientId,
      title,
      notes,
      coverTitle,
      executiveSummary,
      serviceType,
      templateType,
      pricingRule,
      validityDays,
    }: {
      id: string;
      clientId?: string;
      title?: string;
      notes?: string;
      coverTitle?: string;
      executiveSummary?: string;
      serviceType?: string;
      templateType?: string;
      pricingRule?: string;
      validityDays?: number;
    }) =>
      apiPatch(`/quotations/${id}`, {
        clientId,
        title,
        notes,
        coverTitle,
        executiveSummary,
        serviceType,
        templateType,
        pricingRule,
        validityDays,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotations'] });
      queryClient.invalidateQueries({ queryKey: ['kanban'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
    },
  });
}

export function useUpdateQuotationFromBuilder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: {
        clientId: string;
        createdById?: string;
        title: string;
        coverTitle?: string;
        executiveSummary?: string;
        serviceType?: string;
        templateType?: string;
        pricingRule?: string;
        validityDays?: number;
        reusableBlockIds?: string[];
        notes?: string;
        durationOfWork?: string;
        termsAndConditions?: string;
        commercialSections?: Array<{ title: string; content: string }>;
        specialConsiderations?: Array<
          | {
              type: 'PERCENTAGE';
              concept?: string;
              quantity?: number;
              percentage?: number;
              mxnAmount?: number;
              usdAmount?: number;
              sortOrder?: number;
            }
          | { type: 'TRAVEL'; location?: string; mxnAmount?: number; usdAmount?: number; sortOrder?: number }
        >;
        currency?: string;
        exchangeRate?: number;
        items: Array<{
          serviceId: string;
          pricingProfileId: string;
          quantity: number;
          unitPriceOverride?: number;
          isOptional?: boolean;
          optionGroup?: string;
          optionLabel?: string;
        }>;
      };
    }) => apiPatch(`/quotations/${id}/builder`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotations'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] });
      queryClient.invalidateQueries({ queryKey: ['kanban'] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['special-consideration-catalog'] });
      queryClient.invalidateQueries({ queryKey: ['service-templates'] });
      queryClient.invalidateQueries({ queryKey: ['work-item-catalog'] });
    },
  });
}

export function useGeneratePdf() {
  return useMutation({
    mutationFn: (id: string) => apiPost<PdfResponse>(`/quotations/${id}/pdf`),
  });
}

export function useGenerateSimplePdf() {
  return useMutation({
    mutationFn: (id: string) => apiPost<PdfResponse>(`/quotations/${id}/pdf/simple`),
  });
}

export function useDeleteQuotation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      apiDeleteWithBody(`/quotations/${id}`, { password }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotations'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] });
      queryClient.invalidateQueries({ queryKey: ['kanban'] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
    },
  });
}

export function useUpdateQuotationCommercial() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      executiveSummary,
      coverTitle,
      serviceType,
      templateType,
      pricingRule,
      validityDays,
      durationOfWork,
      termsAndConditions,
    }: {
      id: string;
      executiveSummary?: string;
      coverTitle?: string;
      serviceType?: string;
      templateType?: string;
      pricingRule?: string;
      validityDays?: number;
      durationOfWork?: string;
      termsAndConditions?: string;
    }) =>
      apiPatch(`/quotations/${id}/commercial`, {
        executiveSummary,
        coverTitle,
        serviceType,
        templateType,
        pricingRule,
        validityDays,
        durationOfWork,
        termsAndConditions,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotations'] });
      queryClient.invalidateQueries({ queryKey: ['kanban'] });
    },
  });
}

export function useQuotationActivities(id: string | null) {
  return useQuery({
    queryKey: ['quotation-activities', id],
    queryFn: () => apiGet<ActivityResponse>(`/quotations/${id}/activities`),
    enabled: Boolean(id),
  });
}

export function useCreateQuotationActivity() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      description,
      type,
    }: {
      id: string;
      description: string;
      type?: string;
    }) => apiPost(`/quotations/${id}/activities`, { description, type }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['quotation-activities', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['quotations'] });
      queryClient.invalidateQueries({ queryKey: ['kanban'] });
    },
  });
}

export function useDuplicateQuotation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiPost(`/quotations/${id}/duplicate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotations'] });
      queryClient.invalidateQueries({ queryKey: ['kanban'] });
    },
  });
}

export function useMarkQuotationInteraction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'sent' | 'viewed' | 'accepted' | 'rejected' }) =>
      apiPost(`/quotations/${id}/mark-${action}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotations'] });
      queryClient.invalidateQueries({ queryKey: ['kanban'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] });
    },
  });
}

export function useResolveQuotationApproval() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'approve' | 'reject' }) =>
      apiPost(`/quotations/${id}/${decision === 'approve' ? 'approve-discount' : 'reject-discount'}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotations'] });
      queryClient.invalidateQueries({ queryKey: ['kanban'] });
    },
  });
}

export function useConvertQuotationToWorkOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiPost(`/quotations/${id}/convert-to-work-order`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotations'] });
      queryClient.invalidateQueries({ queryKey: ['kanban'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] });
    },
  });
}

export function useImportExcel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: { file: string; source?: string }) =>
      apiPost<{ processed: number; logs: Array<{ serviceCode: string; category: string; action: string }> }>(
        '/imports/excel',
        payload,
      ),
    onSuccess: () => {
      invalidateCatalog(queryClient);
    },
  });
}

export function usePreviewImportExcel() {
  return useMutation({
    mutationFn: (payload: { file: string; source?: string }) =>
      apiPost<ImportPreviewResponse>('/imports/excel/preview', payload),
  });
}

export function useConfirmImportExcel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: {
      source?: string;
      exchangeRate?: number;
      rows: ImportPreviewResponse['rows'];
    }) => apiPost<ImportConfirmResponse>('/imports/excel/confirm', payload),
    onSuccess: () => {
      invalidateCatalog(queryClient);
    },
  });
}

export function useExportCatalogExcel() {
  return useMutation({
    mutationFn: () => apiGet<ExportCatalogResponse>('/imports/excel/export'),
  });
}
