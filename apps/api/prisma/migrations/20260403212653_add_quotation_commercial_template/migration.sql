-- AlterTable
ALTER TABLE "Quotation" ADD COLUMN     "commercialSections" JSONB;

-- CreateTable
CREATE TABLE "QuotationTemplateSetting" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'default',
    "sections" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuotationTemplateSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QuotationTemplateSetting_name_key" ON "QuotationTemplateSetting"("name");
