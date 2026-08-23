CREATE EXTENSION IF NOT EXISTS "pgcrypto";

ALTER TABLE "Proyecto"
  ADD COLUMN IF NOT EXISTS "zona" TEXT NOT NULL DEFAULT 'urbano',
  ADD COLUMN IF NOT EXISTS "urgencia" TEXT NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS "costoBaseMaterial" DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS "costoManoObra" DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS "factorComplejidad" DECIMAL(8,4),
  ADD COLUMN IF NOT EXISTS "factorZona" DECIMAL(8,4),
  ADD COLUMN IF NOT EXISTS "factorUrgencia" DECIMAL(8,4),
  ADD COLUMN IF NOT EXISTS "margen" DECIMAL(8,4),
  ADD COLUMN IF NOT EXISTS "totalFinal" DECIMAL(12,2);

ALTER TABLE "Componente"
  ADD COLUMN IF NOT EXISTS "cantidad" DECIMAL(12,2) NOT NULL DEFAULT 1;

ALTER TABLE "TrainingExample"
  ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;

CREATE TABLE IF NOT EXISTS "Material" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "nombre" TEXT NOT NULL,
  "marca" TEXT NOT NULL,
  "categoria" TEXT NOT NULL,
  "costoBase" DECIMAL(12,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ManoObra" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tipo" TEXT NOT NULL,
  "costoHora" DECIMAL(12,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ManoObra_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "FactorCosto" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tipo" TEXT NOT NULL,
  "nombre" TEXT NOT NULL,
  "valor" DECIMAL(8,4) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FactorCosto_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ManoObra_tipo_key" ON "ManoObra"("tipo");
CREATE UNIQUE INDEX IF NOT EXISTS "FactorCosto_tipo_nombre_key" ON "FactorCosto"("tipo", "nombre");
CREATE INDEX IF NOT EXISTS "Material_categoria_marca_idx" ON "Material"("categoria", "marca");
CREATE INDEX IF NOT EXISTS "FactorCosto_tipo_nombre_idx" ON "FactorCosto"("tipo", "nombre");

ALTER TABLE "Material" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "Material" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Material" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "ManoObra" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "ManoObra" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "ManoObra" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "FactorCosto" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "FactorCosto" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "FactorCosto" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

INSERT INTO "Material" ("nombre", "marca", "categoria", "costoBase")
VALUES
  ('Breaker NSX250', 'Schneider', 'breakers', 600),
  ('Breaker MCCB 250A', 'Eaton', 'breakers', 540),
  ('PLC S7-1500', 'Siemens', 'control', 3500),
  ('Cableado 3/0 AWG', 'Viakon', 'conductores', 1800),
  ('Cableado 3/0 AWG', 'Condumex', 'conductores', 1750),
  ('Transformador 1000 kVA', 'Siemens', 'transformadores', 20000),
  ('UPS 150 kVA', 'APC', 'respaldo', 15000),
  ('Variador de frecuencia', 'ABB', 'control', 1800)
ON CONFLICT DO NOTHING;

INSERT INTO "ManoObra" ("tipo", "costoHora")
VALUES
  ('ingenieria', 120),
  ('instalacion', 85),
  ('mantenimiento', 75),
  ('puesta en marcha', 110)
ON CONFLICT ("tipo") DO UPDATE
SET "costoHora" = EXCLUDED."costoHora",
    "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "FactorCosto" ("tipo", "nombre", "valor")
VALUES
  ('complejidad', 'bajo', 1.0),
  ('complejidad', 'medio', 1.2),
  ('complejidad', 'alto', 1.4),
  ('zona', 'urbano', 1.0),
  ('zona', 'industrial', 1.1),
  ('zona', 'remoto', 1.3),
  ('urgencia', 'normal', 1.0),
  ('urgencia', 'urgente', 1.25)
ON CONFLICT ("tipo", "nombre") DO UPDATE
SET "valor" = EXCLUDED."valor",
    "updatedAt" = CURRENT_TIMESTAMP;
