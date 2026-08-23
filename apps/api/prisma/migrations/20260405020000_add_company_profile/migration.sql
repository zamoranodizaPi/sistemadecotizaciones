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

INSERT INTO "CompanyProfile" (
  "id",
  "legalName",
  "commercialName",
  "brandShortName",
  "tagline",
  "rfc",
  "email",
  "address",
  "country",
  "createdAt",
  "updatedAt"
)
VALUES (
  'company-profile-default',
  'SISTEMAS ELECTRICOS ZARAGOZA',
  'SIEZA',
  'SIEZA',
  'energy solutions',
  'SEZ121221V69',
  'contacto@sieza.mx',
  'Cda. Los Pinos No. 8 A, Francisco I. Madero, Cuautla, Morelos, CP 62744',
  'MX',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO NOTHING;
