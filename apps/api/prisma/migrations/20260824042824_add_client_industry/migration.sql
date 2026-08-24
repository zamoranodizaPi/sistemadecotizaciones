-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "industry" TEXT;

-- CreateIndex
CREATE INDEX "Client_industry_idx" ON "Client"("industry");
