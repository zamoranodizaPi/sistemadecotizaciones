export type QuotationStatus =
  | 'NUEVA'
  | 'EN_PROCESO'
  | 'ENVIADA'
  | 'ACEPTADA'
  | 'EJECUTADA'
  | 'CUENTAS_POR_COBRAR'
  | 'PAGADA';

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
  bootstrapCredentials?: {
    email: string;
    password: string;
  };
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
  services: Array<{
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

export type ClientResponse = Array<{
  id: string;
  legalName: string;
  commercialName: string | null;
  rfc: string;
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
  title: string;
  status: QuotationStatus;
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
  activities?: Array<{
    id: string;
    type: ActivityType;
    description: string;
    createdAt: string;
  }>;
  items: Array<{
    id: string;
    serviceId: string | null;
    pricingProfileId?: string | null;
    serviceCode: string;
    serviceName: string;
    categoryName: string;
    pricingProfileName?: string | null;
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
  items: Array<{
    serviceId: string;
    pricingProfileId: string;
    quantity: number;
    unitPriceOverride?: number;
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

export type ExportCatalogResponse = {
  fileName: string;
  file: string;
};
