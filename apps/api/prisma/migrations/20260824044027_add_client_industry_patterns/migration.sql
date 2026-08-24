-- CreateTable
CREATE TABLE "ClientPattern" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "industry" TEXT,
    "quotationCount" INTEGER NOT NULL DEFAULT 0,
    "frequentServices" JSONB NOT NULL,
    "frequentWorkItems" JSONB NOT NULL,
    "travelLocations" JSONB NOT NULL,
    "avgTotal" DECIMAL(12,2),
    "lastQuotationAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientPattern_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndustryPattern" (
    "id" TEXT NOT NULL,
    "industry" TEXT NOT NULL,
    "clientCount" INTEGER NOT NULL DEFAULT 0,
    "quotationCount" INTEGER NOT NULL DEFAULT 0,
    "frequentServices" JSONB NOT NULL,
    "frequentWorkItems" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IndustryPattern_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClientPattern_clientId_key" ON "ClientPattern"("clientId");

-- CreateIndex
CREATE INDEX "ClientPattern_industry_idx" ON "ClientPattern"("industry");

-- CreateIndex
CREATE UNIQUE INDEX "IndustryPattern_industry_key" ON "IndustryPattern"("industry");

-- AddForeignKey
ALTER TABLE "ClientPattern" ADD CONSTRAINT "ClientPattern_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
