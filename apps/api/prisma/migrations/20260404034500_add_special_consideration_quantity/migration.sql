-- AlterTable
ALTER TABLE "QuotationSpecialConsideration"
ADD COLUMN "quantity" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "SpecialConsiderationCatalog"
ADD COLUMN "quantity" INTEGER NOT NULL DEFAULT 1;
