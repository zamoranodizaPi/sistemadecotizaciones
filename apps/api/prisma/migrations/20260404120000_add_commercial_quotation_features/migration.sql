ALTER TYPE "QuotationStatus" RENAME TO "QuotationStatus_old";

CREATE TYPE "QuotationStatus" AS ENUM (
  'BORRADOR',
  'NUEVA',
  'EN_PROCESO',
  'ENVIADA',
  'VISTA',
  'NEGOCIACION',
  'ACEPTADA',
  'RECHAZADA',
  'VENCIDA',
  'EJECUTADA',
  'CUENTAS_POR_COBRAR',
  'PAGADA'
);

ALTER TABLE "Quotation"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "QuotationStatus"
  USING ("status"::text::"QuotationStatus");

ALTER TABLE "QuotationHistory"
  ALTER COLUMN "fromStatus" TYPE "QuotationStatus"
  USING ("fromStatus"::text::"QuotationStatus"),
  ALTER COLUMN "toStatus" TYPE "QuotationStatus"
  USING ("toStatus"::text::"QuotationStatus");

DROP TYPE "QuotationStatus_old";

CREATE TYPE "ApprovalStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED');

ALTER TABLE "Quotation"
ADD COLUMN "rootQuotationId" TEXT,
ADD COLUMN "previousVersionId" TEXT,
ADD COLUMN "serviceType" TEXT,
ADD COLUMN "templateType" TEXT,
ADD COLUMN "coverTitle" TEXT,
ADD COLUMN "executiveSummary" TEXT,
ADD COLUMN "versionNumber" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "validUntil" TIMESTAMP(3),
ADD COLUMN "sentAt" TIMESTAMP(3),
ADD COLUMN "viewedAt" TIMESTAMP(3),
ADD COLUMN "acceptedAt" TIMESTAMP(3),
ADD COLUMN "rejectedAt" TIMESTAMP(3),
ADD COLUMN "convertedToWorkOrderAt" TIMESTAMP(3),
ADD COLUMN "workOrderNumber" TEXT,
ADD COLUMN "pricingRule" TEXT,
ADD COLUMN "pricingRuleLabel" TEXT,
ADD COLUMN "discountPercent" DECIMAL(8,4),
ADD COLUMN "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
ADD COLUMN "approvalReason" TEXT,
ADD COLUMN "approvalResolvedAt" TIMESTAMP(3),
ADD COLUMN "approvedById" TEXT;

ALTER TABLE "Quotation"
ALTER COLUMN "status" SET DEFAULT 'BORRADOR';

ALTER TABLE "ServiceTemplate"
ADD COLUMN "templateType" TEXT;

ALTER TABLE "QuotationItem"
ADD COLUMN "isOptional" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "optionGroup" TEXT,
ADD COLUMN "optionLabel" TEXT;

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

CREATE UNIQUE INDEX "ReusableTextBlock_name_type_key" ON "ReusableTextBlock"("name", "type");
CREATE INDEX "ReusableTextBlock_type_deletedAt_idx" ON "ReusableTextBlock"("type", "deletedAt");
CREATE INDEX "Quotation_rootQuotationId_idx" ON "Quotation"("rootQuotationId");
CREATE INDEX "Quotation_previousVersionId_idx" ON "Quotation"("previousVersionId");
CREATE INDEX "Quotation_validUntil_idx" ON "Quotation"("validUntil");
CREATE INDEX "Quotation_approvalStatus_idx" ON "Quotation"("approvalStatus");

ALTER TABLE "Quotation"
ADD CONSTRAINT "Quotation_rootQuotationId_fkey" FOREIGN KEY ("rootQuotationId") REFERENCES "Quotation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Quotation"
ADD CONSTRAINT "Quotation_previousVersionId_fkey" FOREIGN KEY ("previousVersionId") REFERENCES "Quotation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Quotation"
ADD CONSTRAINT "Quotation_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
