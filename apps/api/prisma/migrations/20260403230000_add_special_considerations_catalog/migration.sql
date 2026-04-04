CREATE TYPE "SpecialConsiderationType" AS ENUM ('PERCENTAGE', 'TRAVEL');

CREATE TABLE "QuotationSpecialConsideration" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "type" "SpecialConsiderationType" NOT NULL,
    "concept" TEXT,
    "percentage" DECIMAL(8,4),
    "location" TEXT,
    "mxnAmount" DECIMAL(12,2),
    "usdAmount" DECIMAL(12,2),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuotationSpecialConsideration_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SpecialConsiderationCatalog" (
    "id" TEXT NOT NULL,
    "type" "SpecialConsiderationType" NOT NULL,
    "concept" TEXT,
    "percentage" DECIMAL(8,4),
    "location" TEXT,
    "mxnAmount" DECIMAL(12,2),
    "usdAmount" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpecialConsiderationCatalog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "QuotationSpecialConsideration_quotationId_type_sortOrder_idx"
ON "QuotationSpecialConsideration"("quotationId", "type", "sortOrder");

CREATE INDEX "SpecialConsiderationCatalog_type_concept_idx"
ON "SpecialConsiderationCatalog"("type", "concept");

CREATE INDEX "SpecialConsiderationCatalog_type_location_idx"
ON "SpecialConsiderationCatalog"("type", "location");

ALTER TABLE "QuotationSpecialConsideration"
ADD CONSTRAINT "QuotationSpecialConsideration_quotationId_fkey"
FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
