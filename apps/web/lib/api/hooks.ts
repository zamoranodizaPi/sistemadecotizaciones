'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiDeleteWithBody, apiGet, apiPatch, apiPost } from './client';
import type {
  ActivityResponse,
  ActivityImportConfirmResponse,
  ActivityImportPreviewResponse,
  AiCreateDealResponse,
  AiFeedbackResponse,
  AiProyectoConvertResponse,
  AiLearningPromptResponse,
  AiLearningTrainingResponse,
  AiLearningHealthResponse,
  AiProyectoResponse,
  AiSuggestedQuoteResponse,
  AssignableUserResponse,
  AuthUser,
  CatalogResponse,
  ClientInsightsResponse,
  ClientImportConfirmResponse,
  ClientImportPreviewResponse,
  CompanyProfileResponse,
  ClientResponse,
  DashboardMetricsResponse,
  DetectedCatalogServiceResponse,
  ExchangeRateResponse,
  ExportActivitiesResponse,
  ExportCatalogResponse,
  ExportClientsResponse,
  ExportCombinedTemplateResponse,
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
  QuotationLearningResponse,
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

export function useClientInsights(clientId: string | null) {
  return useQuery({
    queryKey: ['client-insights', clientId],
    queryFn: () => apiGet<ClientInsightsResponse>(`/ai-learning/client-insights/${clientId}`),
    enabled: Boolean(clientId),
  });
}

export function useAiLearningHealth() {
  return useQuery({
    queryKey: ['ai-learning-health'],
    queryFn: () => apiGet<AiLearningHealthResponse>('/ai-learning/health'),
  });
}

export function useAiSuggestQuote() {
  return useMutation({
    mutationFn: (payload: { text: string; mode?: 'CATALOG_MATCH' | 'STRUCTURED_JSON' }) =>
      apiPost<AiSuggestedQuoteResponse>('/ai/suggest-quote', payload),
  });
}

export function useAiCreateDeal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: {
      text: string;
      mode?: 'CATALOG_MATCH' | 'STRUCTURED_JSON';
      clientId: string;
      title?: string;
      items?: Array<{ serviceId: string; pricingProfileId: string; quantity: number; unitPriceOverride?: number }>;
      workItems?: string[];
      commercialText?: string;
    }) =>
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
      mode?: 'CATALOG_MATCH' | 'STRUCTURED_JSON';
      original: Record<string, unknown>;
      corrected: Record<string, unknown>;
    }) => apiPost<AiFeedbackResponse>('/ai/feedback', payload),
  });
}

export function useAiLearningPrompts() {
  return useQuery({
    queryKey: ['ai-learning-prompts'],
    queryFn: () => apiGet<AiLearningPromptResponse>('/ai-learning/prompts'),
  });
}

export function useAiLearningTraining() {
  return useQuery({
    queryKey: ['ai-learning-training'],
    queryFn: () => apiGet<AiLearningTrainingResponse>('/ai-learning/training'),
  });
}

export function useSubmitAiLearningTraining() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: {
      input: Record<string, unknown>;
      output: Record<string, unknown>;
      aceptado?: boolean;
    }) => apiPost('/ai-learning/training-free', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-learning-prompts'] });
      queryClient.invalidateQueries({ queryKey: ['ai-learning-training'] });
    },
  });
}

export function useSubmitAiLearningDataset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: {
      trainingDataset: Array<{
        input: Record<string, unknown>;
        output: Record<string, unknown>;
        aceptado?: boolean;
      }>;
    }) => apiPost('/ai-learning/training-dataset', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-learning-training'] });
      queryClient.invalidateQueries({ queryKey: ['ai-learning-prompts'] });
    },
  });
}

export function useDeleteAiLearningTraining() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiDelete(`/ai-learning/training/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-learning-training'] });
    },
  });
}

export function usePromoteAiLearningTraining() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: {
      input: Record<string, unknown>;
      output: Record<string, unknown>;
      mode?: 'CATALOG_MATCH' | 'STRUCTURED_JSON';
    }) => apiPost('/ai-learning/training-promote', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-learning-training'] });
    },
  });
}

export function useAiProyecto() {
  return useMutation({
    mutationFn: (payload: {
      descripcion: string;
      sector: string;
      cliente?: string;
      nombre?: string;
      nivelComplejidad?: string;
      condiciones?: {
        complejidad?: 'bajo' | 'medio' | 'alto';
        zona?: 'urbano' | 'industrial' | 'remoto';
        urgencia?: 'normal' | 'urgente';
        margen?: number;
      };
    }) => apiPost<AiProyectoResponse>('/ai/proyecto', payload),
  });
}

export function useSaveAiProyectoTraining() {
  return useMutation({
    mutationFn: (payload: {
      input: Record<string, unknown>;
      output: Record<string, unknown>;
      aceptado?: boolean;
    }) => apiPost('/ai/proyecto/training', payload),
  });
}

export function useConvertAiProyectoToQuotation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: {
      proyectoId: string;
      clientId: string;
      title?: string;
      currency?: 'MXN' | 'USD';
    }) =>
      apiPost<AiProyectoConvertResponse>(`/ai/proyecto/${payload.proyectoId}/convert-to-quotation`, {
        clientId: payload.clientId,
        title: payload.title,
        currency: payload.currency,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotations'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] });
      queryClient.invalidateQueries({ queryKey: ['kanban'] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
    },
  });
}

export function useGenerateAiProyectoPdf() {
  return useMutation({
    mutationFn: (proyectoId: string) => apiPost<PdfResponse>(`/ai/proyecto/${proyectoId}/pdf`),
  });
}

export function useCreateAiLearningPrompt() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: {
      mode?: 'CATALOG_MATCH' | 'STRUCTURED_JSON';
      name: string;
      systemPrompt: string;
      inputExample?: string;
      outputExample?: string;
      isActive?: boolean;
      sortOrder?: number;
    }) => apiPost('/ai-learning/prompts', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-learning-prompts'] });
    },
  });
}

export function useUpdateAiLearningPrompt() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: {
      id: string;
      mode?: 'CATALOG_MATCH' | 'STRUCTURED_JSON';
      name?: string;
      systemPrompt?: string;
      inputExample?: string;
      outputExample?: string;
      isActive?: boolean;
      sortOrder?: number;
    }) => apiPatch(`/ai-learning/prompts/${payload.id}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-learning-prompts'] });
    },
  });
}

export function useDeleteAiLearningPrompt() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiDelete(`/ai-learning/prompts/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-learning-prompts'] });
    },
  });
}

export function useCatalog() {
  return useQuery({
    queryKey: ['catalog'],
    queryFn: () => apiGet<CatalogResponse>('/catalog'),
  });
}

export function useDetectedCatalogServices() {
  return useQuery({
    queryKey: ['catalog-detected-services'],
    queryFn: () => apiGet<DetectedCatalogServiceResponse>('/catalog/detected-services'),
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

export function useUpdateDetectedCatalogServiceStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: { id: string; status: 'PENDING' | 'APPROVED' | 'DISMISSED' }) =>
      apiPatch(`/catalog/detected-services/${payload.id}/status`, { status: payload.status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalog-detected-services'] });
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

export function useCompanyProfile() {
  return useQuery({
    queryKey: ['company-profile'],
    queryFn: () => apiGet<CompanyProfileResponse>('/company-profile'),
  });
}

export function useUpdateCompanyProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: {
      legalName: string;
      commercialName?: string;
      brandShortName?: string;
      tagline?: string;
      logoUrl?: string;
      rfc?: string;
      email?: string;
      phone?: string;
      website?: string;
      address?: string;
      city?: string;
      state?: string;
      country?: string;
      defaultDurationOfWork?: string;
      defaultTerms?: string;
    }) => apiPatch<CompanyProfileResponse>('/company-profile', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-profile'] });
    },
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
      industry?: string;
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
      industry,
      contacts,
    }: {
      id: string;
      legalName: string;
      commercialName?: string;
      rfc: string;
      address?: string;
      industry?: string;
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
        industry,
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

export function useLearnQuotation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiPost<QuotationLearningResponse>(`/quotations/${id}/learn`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotations'] });
    },
  });
}

export function useRebuildLearning() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => apiPost<{ learned: number }>('/quotations/learn-all'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotations'] });
      queryClient.invalidateQueries({ queryKey: ['ai-learning-training'] });
      queryClient.invalidateQueries({ queryKey: ['ai-learning-health'] });
    },
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
      clientId?: string;
      clientName?: string;
      contactName?: string;
      createdById?: string;
      skipLearning?: boolean;
      title: string;
      coverTitle?: string;
      executiveSummary?: string;
      serviceType?: string;
      templateType?: string;
      pricingRule?: string;
      partCount?: number;
      finalChargeRate?: number;
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
        serviceId?: string;
        pricingProfileId?: string;
        code?: string;
        name?: string;
        categoryName?: string;
        pricingProfileName?: string;
        partNumber?: number;
        partQuantity?: number;
        activityDays?: number;
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

export function useCreateServiceTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: {
      name: string;
      templateType?: string;
      items: Array<{
        serviceId: string;
        pricingProfileId: string;
        quantity: number;
        isOptional?: boolean;
        optionGroup?: string;
        optionLabel?: string;
      }>;
      activityNames?: string[];
    }) => apiPost('/quotations/service-templates', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-templates'] });
    },
  });
}

export function useUpdateServiceTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      ...payload
    }: {
      id: string;
      name: string;
      templateType?: string;
      items: Array<{
        serviceId: string;
        pricingProfileId: string;
        quantity: number;
        isOptional?: boolean;
        optionGroup?: string;
        optionLabel?: string;
      }>;
      activityNames?: string[];
    }) => apiPatch(`/quotations/service-templates/${id}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-templates'] });
    },
  });
}

export function useDeleteServiceTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiDelete(`/quotations/service-templates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-templates'] });
    },
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
    mutationFn: (payload: { name: string; code?: string; unitPrice?: number }) =>
      apiPost<WorkItemCatalogEntry>('/quotations/work-items/catalog', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalog'] });
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
      contactName,
      title,
      notes,
      coverTitle,
      executiveSummary,
      serviceType,
      templateType,
      pricingRule,
      partCount,
      finalChargeRate,
      validityDays,
    }: {
      id: string;
      clientId?: string;
      contactName?: string;
      title?: string;
      notes?: string;
      coverTitle?: string;
      executiveSummary?: string;
      serviceType?: string;
      templateType?: string;
      pricingRule?: string;
      partCount?: number;
      finalChargeRate?: number;
      validityDays?: number;
    }) =>
      apiPatch(`/quotations/${id}`, {
        clientId,
        contactName,
        title,
        notes,
        coverTitle,
        executiveSummary,
        serviceType,
        templateType,
        pricingRule,
        partCount,
        finalChargeRate,
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
        clientId?: string;
        clientName?: string;
        contactName?: string;
        createdById?: string;
        skipLearning?: boolean;
        title: string;
        coverTitle?: string;
        executiveSummary?: string;
        serviceType?: string;
        templateType?: string;
        pricingRule?: string;
        partCount?: number;
        finalChargeRate?: number;
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
          serviceId?: string;
          pricingProfileId?: string;
          code?: string;
          name?: string;
          categoryName?: string;
          pricingProfileName?: string;
          partNumber?: number;
          partQuantity?: number;
          activityDays?: number;
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

export function useGenerateWordReport() {
  return useMutation({
    mutationFn: (id: string) => apiPost<PdfResponse>(`/quotations/${id}/report-word`),
  });
}

export function useGenerateSuggestedWordReport() {
  return useMutation({
    mutationFn: (id: string) => apiPost<PdfResponse>(`/quotations/${id}/report-word/suggested`),
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

export function useExportClientTemplate() {
  return useMutation({
    mutationFn: () => apiGet<ExportCatalogResponse>('/imports/clients/export'),
  });
}

export function useExportActivityTemplate() {
  return useMutation({
    mutationFn: () => apiGet<ExportCatalogResponse>('/imports/activities/export'),
  });
}

export function useExportClientsData() {
  return useMutation({
    mutationFn: (filters?: { sector?: string; city?: string }) => {
      const params = new URLSearchParams();
      if (filters?.sector) {
        params.set('sector', filters.sector);
      }
      if (filters?.city) {
        params.set('city', filters.city);
      }
      const query = params.toString() ? `?${params.toString()}` : '';
      return apiGet<ExportClientsResponse>(`/imports/clients/export/data${query}`);
    },
  });
}

export function useExportActivitiesData() {
  return useMutation({
    mutationFn: (filters?: { query?: string }) => {
      const params = new URLSearchParams();
      if (filters?.query) {
        params.set('q', filters.query);
      }
      const query = params.toString() ? `?${params.toString()}` : '';
      return apiGet<ExportActivitiesResponse>(`/imports/activities/export/data${query}`);
    },
  });
}

export function useExportCombinedTemplate() {
  return useMutation({
    mutationFn: () => apiGet<ExportCombinedTemplateResponse>('/imports/template/combinada'),
  });
}

export function usePreviewClientImport() {
  return useMutation({
    mutationFn: (payload: { file: string; source?: string; sheetName?: string }) =>
      apiPost<ClientImportPreviewResponse>('/imports/clients/preview', payload),
  });
}

export function useConfirmClientImport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: {
      source?: string;
      rows: ClientImportPreviewResponse['rows'];
    }) => apiPost<ClientImportConfirmResponse>('/imports/clients/confirm', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
    },
  });
}

export function usePreviewActivityImport() {
  return useMutation({
    mutationFn: (payload: { file: string; source?: string; sheetName?: string }) =>
      apiPost<ActivityImportPreviewResponse>('/imports/activities/preview', payload),
  });
}

export function useConfirmActivityImport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: {
      source?: string;
      rows: ActivityImportPreviewResponse['rows'];
    }) => apiPost<ActivityImportConfirmResponse>('/imports/activities/confirm', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-item-catalog'] });
    },
  });
}
