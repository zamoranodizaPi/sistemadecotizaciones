-- CreateTable
CREATE TABLE "WorkItemCatalog" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "WorkItemCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkItemCatalog_name_key" ON "WorkItemCatalog"("name");

-- CreateIndex
CREATE INDEX "WorkItemCatalog_deletedAt_idx" ON "WorkItemCatalog"("deletedAt");
