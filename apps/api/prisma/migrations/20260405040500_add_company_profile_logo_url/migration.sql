CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS "CompanyProfile" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "legalName" TEXT NOT NULL,
  "commercialName" TEXT,
  "brandShortName" TEXT,
  "tagline" TEXT,
  "rfc" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "website" TEXT,
  "address" TEXT,
  "city" TEXT,
  "state" TEXT,
  "country" TEXT DEFAULT 'MX',
  "defaultDurationOfWork" TEXT,
  "defaultTerms" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CompanyProfile_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CompanyProfile"
ADD COLUMN IF NOT EXISTS "logoUrl" TEXT;

UPDATE "CompanyProfile"
SET "logoUrl" = '/brand/logo.png'
WHERE "logoUrl" IS NULL;
