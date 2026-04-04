CREATE TABLE "LearnedRule" (
    "id" TEXT NOT NULL,
    "inputText" TEXT NOT NULL,
    "normalizedInput" TEXT NOT NULL,
    "detectedCategory" TEXT,
    "detectedService" TEXT,
    "variables" JSONB NOT NULL,
    "suggestedServices" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearnedRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiFeedback" (
    "id" TEXT NOT NULL,
    "inputText" TEXT NOT NULL,
    "normalizedInput" TEXT NOT NULL,
    "aiOutput" JSONB NOT NULL,
    "userCorrectedOutput" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiFeedback_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LearnedRule_normalizedInput_key" ON "LearnedRule"("normalizedInput");
CREATE INDEX "LearnedRule_detectedCategory_idx" ON "LearnedRule"("detectedCategory");
CREATE INDEX "LearnedRule_detectedService_idx" ON "LearnedRule"("detectedService");
CREATE INDEX "LearnedRule_usageCount_createdAt_idx" ON "LearnedRule"("usageCount", "createdAt");
CREATE INDEX "AiFeedback_normalizedInput_createdAt_idx" ON "AiFeedback"("normalizedInput", "createdAt");
