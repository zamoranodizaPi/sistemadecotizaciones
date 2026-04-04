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

CREATE UNIQUE INDEX "DetectedCatalogService_normalizedName_key" ON "DetectedCatalogService"("normalizedName");
CREATE INDEX "DetectedCatalogService_status_createdAt_idx" ON "DetectedCatalogService"("status", "createdAt");
CREATE INDEX "DetectedCatalogService_suggestedCategory_status_idx" ON "DetectedCatalogService"("suggestedCategory", "status");
