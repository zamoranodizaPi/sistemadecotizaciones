-- AlterTable
ALTER TABLE "LearnedRule" ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'CATALOG_MATCH';
ALTER TABLE "AiFeedback" ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'CATALOG_MATCH';
ALTER TABLE "AiLearningPrompt" ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'CATALOG_MATCH';

-- DropIndex
DROP INDEX IF EXISTS "LearnedRule_normalizedInput_key";
DROP INDEX IF EXISTS "LearnedRule_detectedCategory_idx";
DROP INDEX IF EXISTS "LearnedRule_detectedService_idx";
DROP INDEX IF EXISTS "AiFeedback_normalizedInput_createdAt_idx";
DROP INDEX IF EXISTS "AiLearningPrompt_isActive_sortOrder_createdAt_idx";

-- CreateIndex
CREATE UNIQUE INDEX "LearnedRule_mode_normalizedInput_key" ON "LearnedRule"("mode", "normalizedInput");
CREATE INDEX "LearnedRule_mode_detectedCategory_idx" ON "LearnedRule"("mode", "detectedCategory");
CREATE INDEX "LearnedRule_mode_detectedService_idx" ON "LearnedRule"("mode", "detectedService");
CREATE INDEX "AiFeedback_mode_normalizedInput_createdAt_idx" ON "AiFeedback"("mode", "normalizedInput", "createdAt");
CREATE INDEX "AiLearningPrompt_mode_isActive_sortOrder_createdAt_idx" ON "AiLearningPrompt"("mode", "isActive", "sortOrder", "createdAt");
