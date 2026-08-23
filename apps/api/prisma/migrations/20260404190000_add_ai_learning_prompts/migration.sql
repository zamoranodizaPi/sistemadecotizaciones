-- CreateTable
CREATE TABLE "AiLearningPrompt" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "systemPrompt" TEXT NOT NULL,
    "inputExample" TEXT,
    "outputExample" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiLearningPrompt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiLearningPrompt_isActive_sortOrder_createdAt_idx" ON "AiLearningPrompt"("isActive", "sortOrder", "createdAt");
