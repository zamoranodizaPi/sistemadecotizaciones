export type QuotationStatus =
  | 'BORRADOR'
  | 'NUEVA'
  | 'EN_PROCESO'
  | 'ENVIADA'
  | 'VISTA'
  | 'NEGOCIACION'
  | 'ACEPTADA'
  | 'RECHAZADA'
  | 'VENCIDA'
  | 'EJECUTADA'
  | 'CUENTAS_POR_COBRAR'
  | 'PAGADA';

export type ApprovalStatus = 'NOT_REQUIRED' | 'PENDING' | 'APPROVED' | 'REJECTED';

export type DashboardMetricsResponse = {
  totalQuotations: number;
  conversionRate: number;
  revenue: number;
  forecast: number;
  topServices: Array<[string, number]>;
  revenueByClient: Array<[string, number]>;
  pipelineByStatus: Array<[string, number]>;
};

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'SALES' | 'VIEWER';
  displayRole: 'ADMIN' | 'EDITOR' | 'VIEWER';
  isActive: boolean;
};

export type LoginResponse = {
  accessToken: string;
  user: AuthUser;
};

export type ActivityType =
  | 'NOTE'
  | 'EMAIL'
  | 'CALL'
  | 'STAGE_CHANGE'
  | 'PDF_SENT'
  | 'DEAL_CREATED'
  | 'EDIT';

export type CatalogResponse = Array<{
  id: string;
  name: string;
  code: string;
  description?: string | null;
  supplies: Array<{
    id: string;
    code: string;
    name: string;
    description: string | null;
    unit: string | null;
    relatedWork?: string | null;
    prices: Array<{
      id: string;
      price: string | number;
      validFrom: string;
      validTo: string | null;
      source: string;
    }>;
    pricingProfiles: Array<{
      id: string;
      code: string;
      name: string;
      sortOrder: number;
      mxnPrice: string | number | null;
      usdPrice: string | number | null;
    }>;
  }>;
}>;

export type DetectedCatalogServiceResponse = Array<{
  id: string;
  name: string;
  suggestedCategory: string | null;
  sourceInput: string | null;
  confidence: number;
  usageCount: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}>;

export type ExchangeRateResponse = {
  id: string;
  baseCurrency: string;
  quoteCurrency: string;
  rate: string | number;
  source: string;
  autoSync: boolean;
  fetchedAt?: string | null;
  updatedAt: string;
};

export type CompanyProfileResponse = {
  id: string;
  legalName: string;
  commercialName: string | null;
  brandShortName: string | null;
  tagline: string | null;
  logoUrl: string | null;
  rfc: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  defaultDurationOfWork: string | null;
  defaultTerms: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ClientResponse = Array<{
  id: string;
  legalName: string;
  commercialName: string | null;
  rfc: string | null;
  address?: string | null;
  contacts: Array<{
    id: string;
    fullName: string;
    email: string | null;
    phone?: string | null;
    position: string | null;
  }>;
  quotations: Array<{
    id: string;
    folio: string;
    title: string;
    status: QuotationStatus;
    total: string | number;
    currency: string;
    createdAt: string;
  }>;
}>;

export type QuotationListResponse = Array<{
  id: string;
  folio: string;
  rootQuotationId?: string | null;
  previousVersionId?: string | null;
  serviceType?: string | null;
  templateType?: string | null;
  coverTitle?: string | null;
  executiveSummary?: string | null;
  versionNumber: number;
  validUntil?: string | null;
  sentAt?: string | null;
  viewedAt?: string | null;
  acceptedAt?: string | null;
  rejectedAt?: string | null;
  convertedToWorkOrderAt?: string | null;
  workOrderNumber?: string | null;
  pricingRule?: string | null;
  pricingRuleLabel?: string | null;
  contactName?: string | null;
  partCount?: number | null;
  finalChargeRate?: string | number | null;
  discountPercent?: string | number | null;
  requiresApproval?: boolean;
  approvalStatus?: ApprovalStatus;
  approvalReason?: string | null;
  title: string;
  status: QuotationStatus;
  subtotal?: string | number;
  total: string | number;
  currency: string;
  createdAt: string;
  updatedAt: string;
  notes: string | null;
  durationOfWork?: string | null;
  termsAndConditions?: string | null;
  commercialSections?: Array<{
    title: string;
    content: string;
  }> | null;
  specialConsiderations?: Array<{
    id: string;
    type: 'PERCENTAGE' | 'TRAVEL';
    concept?: string | null;
    quantity?: string | number | null;
    percentage?: string | number | null;
    location?: string | null;
    mxnAmount?: string | number | null;
    usdAmount?: string | number | null;
    sortOrder: number;
  }> | null;
  stage?: {
    id: string;
    name: string;
    code: string;
    probability: string | number;
  } | null;
  client: {
    id: string;
    legalName: string;
  };
  createdBy: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
  approvedBy?: {
    id: string;
    name: string;
    email: string;
    role: string;
  } | null;
  activities?: Array<{
    id: string;
    type: ActivityType;
    description: string;
    createdAt: string;
  }>;
  items: Array<{
    id: string;
    supplyId: string | null;
    pricingProfileId?: string | null;
    supplyCode: string;
    supplyName: string;
    categoryName: string;
    pricingProfileName?: string | null;
    partNumber?: number | null;
    partQuantity?: number | null;
    activityDays?: number | null;
    isOptional?: boolean;
    optionGroup?: string | null;
    optionLabel?: string | null;
    exchangeRateUsed?: string | number | null;
    priceOriginCurrency?: string | null;
    quantity: string | number;
    unitPrice: string | number;
    totalPrice: string | number;
  }>;
}>;

export type PipelineResponse = {
  pipeline: {
    id: string;
    name: string;
    objectType: string;
    stages: Array<{
      id: string;
      name: string;
      code: string;
      order: number;
      probability: string | number;
    }>;
  };
  metrics: {
    deals: number;
    totalAmount: number;
    forecastAmount: number;
    weightedCoverage: number;
  };
};

export type KanbanResponse = {
  pipeline: {
    id: string;
    name: string;
    objectType: string;
    stages: Array<{
      id: string;
      name: string;
      code: string;
      order: number;
      probability: string | number;
    }>;
  };
  stages: Array<{
    id: string;
    name: string;
    code: string;
    order: number;
    probability: string | number;
    deals: Array<{
      id: string;
      folio: string;
      title: string;
      total: string | number;
      currency: string;
      forecastAmount: string | number;
      status: QuotationStatus;
      createdAt: string;
      updatedAt: string;
      itemsCount: number;
      lastActivity: string;
      createdBy: {
        id: string;
        name: string;
      };
      client: {
        id: string;
        legalName: string;
      };
    }>;
  }>;
};

export type ActivityResponse = Array<{
  id: string;
  type: ActivityType;
  description: string;
  createdAt: string;
  user?: {
    id: string;
    name: string;
  } | null;
}>;

export type PdfResponse = {
  fileName: string;
  file: string;
};

export type QuotationTemplateResponse = {
  id: string;
  name: string;
  sections: Array<{
    title: string;
    content: string;
  }>;
};

export type SpecialConsiderationCatalogResponse = Array<{
  id: string;
  type: 'PERCENTAGE' | 'TRAVEL';
  concept?: string | null;
  quantity?: string | number | null;
  percentage?: string | number | null;
  location?: string | null;
  mxnAmount?: string | number | null;
  usdAmount?: string | number | null;
  updatedAt: string;
}>;

export type ServiceTemplateResponse = Array<{
  id: string;
  name: string;
  templateType?: string | null;
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
  commercialSections?: Array<{
    title: string;
    content: string;
  }> | null;
  specialConsiderations?: Array<{
    type: 'PERCENTAGE' | 'TRAVEL';
    concept?: string;
    quantity?: number;
    percentage?: number;
    mxnAmount?: number;
    usdAmount?: number;
    location?: string;
    sortOrder?: number;
  }> | null;
  createdAt: string;
  updatedAt: string;
}>;

export type WorkItemCatalogResponse = Array<{
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}>;

export type WorkItemCatalogEntry = WorkItemCatalogResponse[number];

export type QuotationLearningResponse = {
  learned: boolean;
};

export type ReusableTextBlockResponse = Array<{
  id: string;
  name: string;
  type: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}>;

export type AiSuggestedQuoteResponse = {
  mode: 'CATALOG_MATCH' | 'STRUCTURED_JSON';
  engine: 'openai' | 'anthropic' | 'rules' | 'local_learning';
  ai_status:
    | 'openai_ok'
    | 'anthropic_ok'
    | 'fallback_no_key'
    | 'fallback_insufficient_quota'
    | 'fallback_provider_error'
    | 'local_rule_match';
  detected: {
    category: string | null;
    service: string | null;
    variables: Record<string, string | number>;
  };
  suggested_items: Array<{
    serviceId?: string | null;
    pricingProfileId?: string | null;
    service: string;
    model?: string | null;
    quantity: number;
    unit_price: number;
    total: number;
  }>;
  suggested_work_items: string[];
  suggested_commercial_text: string;
  structured_output: Record<string, unknown> | null;
  historical_references: Array<{
    id: string;
    folio: string;
    title: string;
    client: string;
    similarity: number;
  }>;
  confidence: number;
  catalog_updates: {
    pending_count: number;
    detected_pending: string[];
  };
  missing_fields: string[];
  needs_review: boolean;
  rules_applied: string[];
  applied_rule?: {
    id: string;
    category?: string | null;
    service?: string | null;
  } | null;
};

export type AiFeedbackResponse = {
  saved: boolean;
  mode?: 'CATALOG_MATCH' | 'STRUCTURED_JSON';
  ai_status: 'feedback_learned';
  normalized_input: string;
};

export type AiCreateDealResponse = {
  quotationId: string;
  folio: string;
  title: string;
  status: QuotationStatus;
  suggestion: AiSuggestedQuoteResponse;
};

export type AiLearningPromptResponse = Array<{
  id: string;
  mode: 'CATALOG_MATCH' | 'STRUCTURED_JSON';
  name: string;
  systemPrompt: string;
  inputExample: string | null;
  outputExample: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}>;

export type AiLearningTrainingResponse = Array<{
  id: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  aceptado?: boolean | null;
  createdAt: string;
}>;

export type AiLearningDatasetResponse = {
  trainingDataset: Array<{
    input: Record<string, unknown>;
    output: Record<string, unknown>;
    aceptado?: boolean;
  }>;
};

export type AiProyectoResponse = {
  engine: 'openai' | 'rules';
  input: {
    nombre: string;
    cliente: string;
    sector: string;
    descripcion: string;
    nivelComplejidad: string;
    condiciones: {
      complejidad: string;
      zona: string;
      urgencia: string;
      margen?: number;
    };
  };
  similares: Array<{
    id: string;
    score: number;
    aceptado: boolean | null;
    costSignals?: string[];
    costInfluence?: number;
  }>;
  proyecto: {
    id: string;
    nombre: string;
    cliente: string;
    sector: string;
    descripcion: string;
    complejidad: string;
    zona: string;
    urgencia: string;
    costoBaseMaterial?: string | number | null;
    costoManoObra?: string | number | null;
    factorComplejidad?: string | number | null;
    factorZona?: string | number | null;
    factorUrgencia?: string | number | null;
    margen?: string | number | null;
    totalFinal?: string | number | null;
    createdAt: string;
    soluciones: Array<{
      id: string;
      tipo: string;
      incluyeIngenieria: boolean;
      incluyeInstalacion: boolean;
      incluyePuestaMarcha: boolean;
      incluyeMantenimiento: boolean;
      createdAt: string;
      componentes: Array<{
        id: string;
        tipo: string;
        nombre: string;
        marca: string | null;
        categoria: string;
        costoBase: string | number;
        cantidad: string | number;
        createdAt: string;
      }>;
    }>;
  };
  costos: {
    costo_base: number;
    materiales: number;
    mano_obra: number;
    factores: {
      complejidad: number;
      zona: number;
      urgencia: number;
    };
    margen: number;
    total_final: number;
  };
  trainingExampleId: string;
};

export type AiProyectoConvertResponse = {
  proyectoId: string;
  quotationId: string;
  folio: string;
  title: string;
  matchedItems: number;
  unmatchedComponents: string[];
};

export type AssignableUserResponse = AuthUser[];

export type ImportPreviewResponse = {
  source?: string;
  sheets: number;
  exchangeRate: number;
  rows: Array<{
    categoryName: string;
    categoryCode: string;
    unit?: string;
    description?: string;
    relatedWork?: string;
    suffix: string;
    consecutive: string;
    serviceCode: string;
    serviceName: string;
    validFrom?: string | null;
    options: Array<{
      code: string;
      name: string;
      mxnPrice: number;
      usdPrice: number;
      sortOrder: number;
    }>;
  }>;
};

export type ImportConfirmResponse = {
  exchangeRate: number;
  sheets: number;
  processed: number;
  logs: Array<{
    category: string;
    serviceCode: string;
    serviceName: string;
    options: number;
    validFrom: string | null;
    action: string;
  }>;
};

export type ClientImportPreviewResponse = {
  source?: string;
  total: number;
  rows: Array<{
    nombreEmpresa: string;
    contactoPrincipal: string;
    puestoContacto?: string;
    direccionCompleta?: string;
    ciudad?: string;
    estado?: string;
    pais?: string;
    telefono?: string;
    correoElectronico?: string;
    rfc: string;
    sector?: string;
  }>;
};

export type ClientImportConfirmResponse = {
  processed: number;
  logs: Array<{
    companyName: string;
    rfc: string;
    contact: string;
    sector?: string | null;
    action: string;
    source?: string;
  }>;
};

export type ActivityImportPreviewResponse = {
  source?: string;
  total: number;
  rows: Array<{
    name: string;
  }>;
};

export type ActivityImportConfirmResponse = {
  processed: number;
  logs: Array<{
    activityName: string;
    action: string;
    source?: string;
  }>;
};

export type ExportCatalogResponse = {
  fileName: string;
  file: string;
};

export type ExportClientsResponse = ExportCatalogResponse;
export type ExportActivitiesResponse = ExportCatalogResponse;
export type ExportCombinedTemplateResponse = ExportCatalogResponse;
