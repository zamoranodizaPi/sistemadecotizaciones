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

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeRateSetting_baseCurrency_quoteCurrency_key" ON "ExchangeRateSetting"("baseCurrency", "quoteCurrency");

-- AlterTable
ALTER TABLE "QuotationItem"
ADD COLUMN "pricingProfileName" TEXT,
ADD COLUMN "exchangeRateUsed" DECIMAL(12,6),
ADD COLUMN "priceOriginCurrency" TEXT;

-- AlterTable
ALTER TABLE "ServicePricingProfile"
ADD COLUMN "code" TEXT,
ADD COLUMN "name" TEXT,
ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- Backfill dynamic pricing option identity from old hardcoded dimensions
UPDATE "ServicePricingProfile"
SET
  "code" = CONCAT("voltageLevel"::text, '_', "sectionBand"::text),
  "name" = CASE
    WHEN "voltageLevel" = 'KV_5' AND "sectionBand" = 'UP_TO_6' THEN '5 KV / Hasta 6 secciones'
    WHEN "voltageLevel" = 'KV_5' AND "sectionBand" = 'MORE_THAN_7' THEN '5 KV / Mas de 7 secciones'
    WHEN "voltageLevel" = 'KV_15' AND "sectionBand" = 'UP_TO_6' THEN '15 KV / Hasta 6 secciones'
    WHEN "voltageLevel" = 'KV_15' AND "sectionBand" = 'MORE_THAN_7' THEN '15 KV / Mas de 7 secciones'
    WHEN "voltageLevel" = 'KV_23' AND "sectionBand" = 'UP_TO_6' THEN '23 KV / Hasta 6 secciones'
    WHEN "voltageLevel" = 'KV_23' AND "sectionBand" = 'MORE_THAN_7' THEN '23 KV / Mas de 7 secciones'
    WHEN "voltageLevel" = 'KV_34_5' AND "sectionBand" = 'NOT_APPLICABLE' THEN '34.5 KV'
    ELSE CONCAT("voltageLevel"::text, ' / ', "sectionBand"::text)
  END,
  "sortOrder" = CASE
    WHEN "voltageLevel" = 'KV_5' AND "sectionBand" = 'UP_TO_6' THEN 1
    WHEN "voltageLevel" = 'KV_5' AND "sectionBand" = 'MORE_THAN_7' THEN 2
    WHEN "voltageLevel" = 'KV_15' AND "sectionBand" = 'UP_TO_6' THEN 3
    WHEN "voltageLevel" = 'KV_15' AND "sectionBand" = 'MORE_THAN_7' THEN 4
    WHEN "voltageLevel" = 'KV_23' AND "sectionBand" = 'UP_TO_6' THEN 5
    WHEN "voltageLevel" = 'KV_23' AND "sectionBand" = 'MORE_THAN_7' THEN 6
    WHEN "voltageLevel" = 'KV_34_5' AND "sectionBand" = 'NOT_APPLICABLE' THEN 7
    ELSE 999
  END
WHERE "code" IS NULL OR "name" IS NULL;

-- Make backfilled columns required
ALTER TABLE "ServicePricingProfile"
ALTER COLUMN "code" SET NOT NULL,
ALTER COLUMN "name" SET NOT NULL;

-- Copy the resolved option name to quotation snapshots
UPDATE "QuotationItem" qi
SET "pricingProfileName" = spp."name"
FROM "ServicePricingProfile" spp
WHERE qi."pricingProfileId" = spp."id"
  AND qi."pricingProfileName" IS NULL;

-- Replace old uniqueness with new dynamic identity
DROP INDEX "ServicePricingProfile_serviceId_voltageLevel_sectionBand_key";
CREATE UNIQUE INDEX "ServicePricingProfile_serviceId_code_key" ON "ServicePricingProfile"("serviceId", "code");

-- Remove old hardcoded pricing dimensions from snapshots and config
ALTER TABLE "QuotationItem"
DROP COLUMN "sectionBand",
DROP COLUMN "voltageLevel";

ALTER TABLE "ServicePricingProfile"
DROP COLUMN "sectionBand",
DROP COLUMN "voltageLevel";

-- Drop obsolete enums
DROP TYPE "SectionBand";
DROP TYPE "VoltageLevel";
