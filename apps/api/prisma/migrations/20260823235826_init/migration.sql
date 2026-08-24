-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'SALES', 'OPERATIONS', 'FINANCE', 'VIEWER');

-- CreateEnum
CREATE TYPE "QuotationStatus" AS ENUM ('BORRADOR', 'NUEVA', 'EN_PROCESO', 'ENVIADA', 'VISTA', 'NEGOCIACION', 'ACEPTADA', 'RECHAZADA', 'VENCIDA', 'EJECUTADA', 'CUENTAS_POR_COBRAR', 'PAGADA');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('NOTE', 'EMAIL', 'CALL', 'STAGE_CHANGE', 'PDF_SENT', 'DEAL_CREATED', 'EDIT');

-- CreateEnum
CREATE TYPE "SpecialConsiderationType" AS ENUM ('PERCENTAGE', 'TRAVEL');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pipeline" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "objectType" TEXT NOT NULL DEFAULT 'deals',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pipeline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealStage" (
    "id" TEXT NOT NULL,
    "pipelineId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "probability" DECIMAL(4,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "unit" TEXT,
    "relatedWork" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServicePrice" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3),
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServicePrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServicePricingProfile" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "mxnPrice" DECIMAL(12,2),
    "usdPrice" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServicePricingProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServicePricingProfileVersion" (
    "id" TEXT NOT NULL,
    "pricingProfileId" TEXT NOT NULL,
    "mxnPrice" DECIMAL(12,2),
    "usdPrice" DECIMAL(12,2),
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3),
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServicePricingProfileVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangeRateSetting" (
    "id" TEXT NOT NULL,
    "baseCurrency" TEXT NOT NULL DEFAULT 'USD',
    "quoteCurrency" TEXT NOT NULL DEFAULT 'MXN',
    "rate" DECIMAL(12,6) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "autoSync" BOOLEAN NOT NULL DEFAULT true,
    "fetchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExchangeRateSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyProfile" (
    "id" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "commercialName" TEXT,
    "brandShortName" TEXT,
    "tagline" TEXT,
    "logoUrl" TEXT,
    "rfc" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT DEFAULT 'MX',
    "defaultDurationOfWork" TEXT,
    "defaultTerms" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "commercialName" TEXT,
    "rfc" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT DEFAULT 'MX',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "position" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quotation" (
    "id" TEXT NOT NULL,
    "folio" TEXT NOT NULL,
    "rootQuotationId" TEXT,
    "previousVersionId" TEXT,
    "clientId" TEXT NOT NULL,
    "contactName" TEXT,
    "pipelineId" TEXT,
    "stageId" TEXT,
    "status" "QuotationStatus" NOT NULL DEFAULT 'BORRADOR',
    "serviceType" TEXT,
    "templateType" TEXT,
    "coverTitle" TEXT,
    "executiveSummary" TEXT,
    "versionNumber" INTEGER NOT NULL DEFAULT 1,
    "validUntil" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "viewedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "convertedToWorkOrderAt" TIMESTAMP(3),
    "workOrderNumber" TEXT,
    "pricingRule" TEXT,
    "pricingRuleLabel" TEXT,
    "partCount" INTEGER NOT NULL DEFAULT 1,
    "discountPercent" DECIMAL(8,4),
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
    "approvalReason" TEXT,
    "approvalResolvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "durationOfWork" TEXT,
    "termsAndConditions" TEXT,
    "commercialSections" JSONB,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "finalChargeRate" DECIMAL(8,4) NOT NULL DEFAULT 16,
    "tax" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'MXN',
    "pdfFileName" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Quotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuotationSpecialConsideration" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "type" "SpecialConsiderationType" NOT NULL,
    "concept" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "percentage" DECIMAL(8,4),
    "location" TEXT,
    "mxnAmount" DECIMAL(12,2),
    "usdAmount" DECIMAL(12,2),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuotationSpecialConsideration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpecialConsiderationCatalog" (
    "id" TEXT NOT NULL,
    "type" "SpecialConsiderationType" NOT NULL,
    "concept" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "percentage" DECIMAL(8,4),
    "location" TEXT,
    "mxnAmount" DECIMAL(12,2),
    "usdAmount" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpecialConsiderationCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuotationTemplateSetting" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'default',
    "sections" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuotationTemplateSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "templateType" TEXT,
    "items" JSONB NOT NULL,
    "commercialSections" JSONB,
    "specialConsiderations" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ServiceTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkItemCatalog" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "unitPrice" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "WorkItemCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReusableTextBlock" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ReusableTextBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuotationItem" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "serviceId" TEXT,
    "pricingProfileId" TEXT,
    "serviceCode" TEXT NOT NULL,
    "serviceName" TEXT NOT NULL,
    "categoryName" TEXT NOT NULL,
    "pricingProfileName" TEXT,
    "partNumber" INTEGER NOT NULL DEFAULT 1,
    "partQuantity" INTEGER NOT NULL DEFAULT 1,
    "activityDays" INTEGER NOT NULL DEFAULT 1,
    "isOptional" BOOLEAN NOT NULL DEFAULT false,
    "optionGroup" TEXT,
    "optionLabel" TEXT,
    "quantity" DECIMAL(12,2) NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "totalPrice" DECIMAL(12,2) NOT NULL,
    "exchangeRateUsed" DECIMAL(12,6),
    "priceOriginCurrency" TEXT,
    "priceVersionId" TEXT,

    CONSTRAINT "QuotationItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuotationHistory" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "eventType" TEXT NOT NULL,
    "fromStatus" "QuotationStatus",
    "toStatus" "QuotationStatus",
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuotationHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "userId" TEXT,
    "type" "ActivityType" NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" JSONB,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearnedRule" (
    "id" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'CATALOG_MATCH',
    "inputText" TEXT NOT NULL,
    "normalizedInput" TEXT NOT NULL,
    "detectedCategory" TEXT,
    "detectedService" TEXT,
    "variables" JSONB NOT NULL,
    "suggestedServices" JSONB NOT NULL,
    "suggestedWorkItems" JSONB NOT NULL,
    "rejectedServices" JSONB NOT NULL,
    "rejectedWorkItems" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearnedRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiFeedback" (
    "id" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'CATALOG_MATCH',
    "inputText" TEXT NOT NULL,
    "normalizedInput" TEXT NOT NULL,
    "aiOutput" JSONB NOT NULL,
    "userCorrectedOutput" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiLearningPrompt" (
    "id" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'CATALOG_MATCH',
    "name" TEXT NOT NULL,
    "systemPrompt" TEXT NOT NULL,
    "inputExample" TEXT,
    "outputExample" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiLearningPrompt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DetectedCatalogService" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "suggestedCategory" TEXT,
    "sourceInput" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "usageCount" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DetectedCatalogService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Proyecto" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "cliente" TEXT NOT NULL,
    "sector" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "nivelComplejidad" TEXT NOT NULL,
    "zona" TEXT NOT NULL DEFAULT 'urbano',
    "urgencia" TEXT NOT NULL DEFAULT 'normal',
    "costoBaseMaterial" DECIMAL(12,2),
    "costoManoObra" DECIMAL(12,2),
    "factorComplejidad" DECIMAL(8,4),
    "factorZona" DECIMAL(8,4),
    "factorUrgencia" DECIMAL(8,4),
    "margen" DECIMAL(8,4),
    "totalFinal" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Proyecto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Solucion" (
    "id" TEXT NOT NULL,
    "proyectoId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "incluyeIngenieria" BOOLEAN NOT NULL DEFAULT false,
    "incluyeInstalacion" BOOLEAN NOT NULL DEFAULT false,
    "incluyePuestaMarcha" BOOLEAN NOT NULL DEFAULT false,
    "incluyeMantenimiento" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Solucion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Componente" (
    "id" TEXT NOT NULL,
    "solucionId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "marca" TEXT,
    "categoria" TEXT NOT NULL,
    "costo" DECIMAL(12,2) NOT NULL,
    "cantidad" DECIMAL(12,2) NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Componente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Material" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "marca" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "costoBase" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManoObra" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "costoHora" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManoObra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FactorCosto" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "valor" DECIMAL(8,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FactorCosto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingExample" (
    "id" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "output" JSONB NOT NULL,
    "embedding" DOUBLE PRECISION[],
    "aceptado" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainingExample_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Pipeline_objectType_isDefault_key" ON "Pipeline"("objectType", "isDefault");

-- CreateIndex
CREATE UNIQUE INDEX "DealStage_pipelineId_code_key" ON "DealStage"("pipelineId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "DealStage_pipelineId_order_key" ON "DealStage"("pipelineId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Category_code_key" ON "Category"("code");

-- CreateIndex
CREATE INDEX "Category_deletedAt_idx" ON "Category"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Service_code_key" ON "Service"("code");

-- CreateIndex
CREATE INDEX "Service_categoryId_deletedAt_idx" ON "Service"("categoryId", "deletedAt");

-- CreateIndex
CREATE INDEX "ServicePrice_serviceId_validFrom_validTo_idx" ON "ServicePrice"("serviceId", "validFrom", "validTo");

-- CreateIndex
CREATE INDEX "ServicePricingProfile_serviceId_idx" ON "ServicePricingProfile"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "ServicePricingProfile_serviceId_code_name_key" ON "ServicePricingProfile"("serviceId", "code", "name");

-- CreateIndex
CREATE INDEX "ServicePricingProfileVersion_pricingProfileId_validFrom_val_idx" ON "ServicePricingProfileVersion"("pricingProfileId", "validFrom", "validTo");

-- CreateIndex
CREATE UNIQUE INDEX "ServicePricingProfileVersion_pricingProfileId_validFrom_key" ON "ServicePricingProfileVersion"("pricingProfileId", "validFrom");

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeRateSetting_baseCurrency_quoteCurrency_key" ON "ExchangeRateSetting"("baseCurrency", "quoteCurrency");

-- CreateIndex
CREATE UNIQUE INDEX "Client_rfc_key" ON "Client"("rfc");

-- CreateIndex
CREATE INDEX "Client_deletedAt_idx" ON "Client"("deletedAt");

-- CreateIndex
CREATE INDEX "Contact_clientId_idx" ON "Contact"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "Quotation_folio_key" ON "Quotation"("folio");

-- CreateIndex
CREATE INDEX "Quotation_clientId_status_createdAt_idx" ON "Quotation"("clientId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Quotation_pipelineId_stageId_idx" ON "Quotation"("pipelineId", "stageId");

-- CreateIndex
CREATE INDEX "QuotationSpecialConsideration_quotationId_type_sortOrder_idx" ON "QuotationSpecialConsideration"("quotationId", "type", "sortOrder");

-- CreateIndex
CREATE INDEX "SpecialConsiderationCatalog_type_concept_idx" ON "SpecialConsiderationCatalog"("type", "concept");

-- CreateIndex
CREATE INDEX "SpecialConsiderationCatalog_type_location_idx" ON "SpecialConsiderationCatalog"("type", "location");

-- CreateIndex
CREATE UNIQUE INDEX "QuotationTemplateSetting_name_key" ON "QuotationTemplateSetting"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceTemplate_name_key" ON "ServiceTemplate"("name");

-- CreateIndex
CREATE INDEX "ServiceTemplate_deletedAt_idx" ON "ServiceTemplate"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorkItemCatalog_name_key" ON "WorkItemCatalog"("name");

-- CreateIndex
CREATE UNIQUE INDEX "WorkItemCatalog_code_key" ON "WorkItemCatalog"("code");

-- CreateIndex
CREATE INDEX "WorkItemCatalog_deletedAt_idx" ON "WorkItemCatalog"("deletedAt");

-- CreateIndex
CREATE INDEX "ReusableTextBlock_type_deletedAt_idx" ON "ReusableTextBlock"("type", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReusableTextBlock_name_type_key" ON "ReusableTextBlock"("name", "type");

-- CreateIndex
CREATE INDEX "QuotationItem_quotationId_idx" ON "QuotationItem"("quotationId");

-- CreateIndex
CREATE INDEX "QuotationHistory_quotationId_createdAt_idx" ON "QuotationHistory"("quotationId", "createdAt");

-- CreateIndex
CREATE INDEX "Activity_quotationId_createdAt_idx" ON "Activity"("quotationId", "createdAt");

-- CreateIndex
CREATE INDEX "LearnedRule_mode_detectedCategory_idx" ON "LearnedRule"("mode", "detectedCategory");

-- CreateIndex
CREATE INDEX "LearnedRule_mode_detectedService_idx" ON "LearnedRule"("mode", "detectedService");

-- CreateIndex
CREATE INDEX "LearnedRule_usageCount_createdAt_idx" ON "LearnedRule"("usageCount", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LearnedRule_mode_normalizedInput_key" ON "LearnedRule"("mode", "normalizedInput");

-- CreateIndex
CREATE INDEX "AiFeedback_mode_normalizedInput_createdAt_idx" ON "AiFeedback"("mode", "normalizedInput", "createdAt");

-- CreateIndex
CREATE INDEX "AiLearningPrompt_mode_isActive_sortOrder_createdAt_idx" ON "AiLearningPrompt"("mode", "isActive", "sortOrder", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DetectedCatalogService_normalizedName_key" ON "DetectedCatalogService"("normalizedName");

-- CreateIndex
CREATE INDEX "DetectedCatalogService_status_createdAt_idx" ON "DetectedCatalogService"("status", "createdAt");

-- CreateIndex
CREATE INDEX "DetectedCatalogService_suggestedCategory_status_idx" ON "DetectedCatalogService"("suggestedCategory", "status");

-- CreateIndex
CREATE INDEX "Proyecto_sector_createdAt_idx" ON "Proyecto"("sector", "createdAt");

-- CreateIndex
CREATE INDEX "Proyecto_cliente_createdAt_idx" ON "Proyecto"("cliente", "createdAt");

-- CreateIndex
CREATE INDEX "Solucion_proyectoId_tipo_idx" ON "Solucion"("proyectoId", "tipo");

-- CreateIndex
CREATE INDEX "Componente_solucionId_tipo_idx" ON "Componente"("solucionId", "tipo");

-- CreateIndex
CREATE INDEX "Componente_categoria_marca_idx" ON "Componente"("categoria", "marca");

-- CreateIndex
CREATE INDEX "Material_categoria_marca_idx" ON "Material"("categoria", "marca");

-- CreateIndex
CREATE UNIQUE INDEX "ManoObra_tipo_key" ON "ManoObra"("tipo");

-- CreateIndex
CREATE INDEX "FactorCosto_tipo_nombre_idx" ON "FactorCosto"("tipo", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "FactorCosto_tipo_nombre_key" ON "FactorCosto"("tipo", "nombre");

-- CreateIndex
CREATE INDEX "TrainingExample_aceptado_createdAt_idx" ON "TrainingExample"("aceptado", "createdAt");

-- AddForeignKey
ALTER TABLE "DealStage" ADD CONSTRAINT "DealStage_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "Pipeline"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServicePrice" ADD CONSTRAINT "ServicePrice_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServicePricingProfile" ADD CONSTRAINT "ServicePricingProfile_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServicePricingProfileVersion" ADD CONSTRAINT "ServicePricingProfileVersion_pricingProfileId_fkey" FOREIGN KEY ("pricingProfileId") REFERENCES "ServicePricingProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "Pipeline"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "DealStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_rootQuotationId_fkey" FOREIGN KEY ("rootQuotationId") REFERENCES "Quotation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_previousVersionId_fkey" FOREIGN KEY ("previousVersionId") REFERENCES "Quotation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationSpecialConsideration" ADD CONSTRAINT "QuotationSpecialConsideration_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationItem" ADD CONSTRAINT "QuotationItem_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationItem" ADD CONSTRAINT "QuotationItem_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationItem" ADD CONSTRAINT "QuotationItem_pricingProfileId_fkey" FOREIGN KEY ("pricingProfileId") REFERENCES "ServicePricingProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationHistory" ADD CONSTRAINT "QuotationHistory_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationHistory" ADD CONSTRAINT "QuotationHistory_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Solucion" ADD CONSTRAINT "Solucion_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "Proyecto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Componente" ADD CONSTRAINT "Componente_solucionId_fkey" FOREIGN KEY ("solucionId") REFERENCES "Solucion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
