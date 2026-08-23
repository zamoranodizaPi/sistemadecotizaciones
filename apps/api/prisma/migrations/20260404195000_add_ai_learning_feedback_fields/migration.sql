-- AlterTable
ALTER TABLE "LearnedRule"
ADD COLUMN "suggestedWorkItems" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN "rejectedServices" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN "rejectedWorkItems" JSONB NOT NULL DEFAULT '[]';
