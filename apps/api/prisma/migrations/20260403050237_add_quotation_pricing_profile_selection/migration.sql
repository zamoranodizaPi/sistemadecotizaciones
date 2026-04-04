-- CreateEnum
CREATE TYPE "VoltageLevel" AS ENUM ('KV_5', 'KV_15', 'KV_23', 'KV_34_5');

-- CreateEnum
CREATE TYPE "SectionBand" AS ENUM ('UP_TO_6', 'MORE_THAN_7', 'NOT_APPLICABLE');

-- AlterTable
ALTER TABLE "QuotationItem" ADD COLUMN     "pricingProfileId" TEXT,
ADD COLUMN     "sectionBand" "SectionBand",
ADD COLUMN     "voltageLevel" "VoltageLevel";

-- CreateTable
CREATE TABLE "ServicePricingProfile" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "voltageLevel" "VoltageLevel" NOT NULL,
    "sectionBand" "SectionBand" NOT NULL,
    "mxnPrice" DECIMAL(12,2),
    "usdPrice" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServicePricingProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServicePricingProfile_serviceId_idx" ON "ServicePricingProfile"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "ServicePricingProfile_serviceId_voltageLevel_sectionBand_key" ON "ServicePricingProfile"("serviceId", "voltageLevel", "sectionBand");

-- AddForeignKey
ALTER TABLE "ServicePricingProfile" ADD CONSTRAINT "ServicePricingProfile_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotationItem" ADD CONSTRAINT "QuotationItem_pricingProfileId_fkey" FOREIGN KEY ("pricingProfileId") REFERENCES "ServicePricingProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
