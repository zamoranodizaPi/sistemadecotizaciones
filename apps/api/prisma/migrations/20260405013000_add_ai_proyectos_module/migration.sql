-- CreateTable
CREATE TABLE "Proyecto" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "cliente" TEXT NOT NULL,
    "sector" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "nivelComplejidad" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Proyecto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Solucion" (
    "id" TEXT NOT NULL,
    "proyectoId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "incluyeIngenieria" BOOLEAN NOT NULL DEFAULT false,
    "incluyeInstalacion" BOOLEAN NOT NULL DEFAULT false,
    "incluyePuestaMarcha" BOOLEAN NOT NULL DEFAULT false,
    "incluyeMantenimiento" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Solucion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Componente" (
    "id" TEXT NOT NULL,
    "solucionId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "marca" TEXT,
    "categoria" TEXT NOT NULL,
    "costo" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Componente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingExample" (
    "id" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "output" JSONB NOT NULL,
    "embedding" DOUBLE PRECISION[] DEFAULT ARRAY[]::DOUBLE PRECISION[],
    "aceptado" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TrainingExample_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Proyecto_sector_createdAt_idx" ON "Proyecto"("sector", "createdAt");
CREATE INDEX "Proyecto_cliente_createdAt_idx" ON "Proyecto"("cliente", "createdAt");
CREATE INDEX "Solucion_proyectoId_tipo_idx" ON "Solucion"("proyectoId", "tipo");
CREATE INDEX "Componente_solucionId_tipo_idx" ON "Componente"("solucionId", "tipo");
CREATE INDEX "Componente_categoria_marca_idx" ON "Componente"("categoria", "marca");
CREATE INDEX "TrainingExample_aceptado_createdAt_idx" ON "TrainingExample"("aceptado", "createdAt");

-- AddForeignKey
ALTER TABLE "Solucion" ADD CONSTRAINT "Solucion_proyectoId_fkey" FOREIGN KEY ("proyectoId") REFERENCES "Proyecto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Componente" ADD CONSTRAINT "Componente_solucionId_fkey" FOREIGN KEY ("solucionId") REFERENCES "Solucion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed industrial catalog categories
INSERT INTO "Category" ("id", "name", "code", "description", "createdAt", "updatedAt", "deletedAt")
VALUES
  ('seed-cat-breakers', 'Breakers', 'BREAKERS', 'Breakers y proteccion termomagnetica industrial', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
  ('seed-cat-cableado', 'Cableado', 'CABLEADO', 'Conductores y cableado industrial', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
  ('seed-cat-automatizacion', 'Automatizacion', 'AUTOMATIZACION', 'Control y automatizacion industrial', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
  ('seed-cat-proteccion', 'Proteccion', 'PROTECCION', 'Sistemas de proteccion industrial', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL)
ON CONFLICT ("code") DO UPDATE
SET "name" = EXCLUDED."name",
    "description" = EXCLUDED."description",
    "updatedAt" = CURRENT_TIMESTAMP,
    "deletedAt" = NULL;

-- Seed industrial supplies
INSERT INTO "Service" ("id", "categoryId", "code", "name", "description", "unit", "relatedWork", "createdAt", "updatedAt", "deletedAt")
SELECT
  seed.id,
  category."id",
  seed.code,
  seed.name,
  seed.description,
  seed.unit,
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  NULL
FROM (
  VALUES
    ('seed-supply-breaker-schneider', 'BREAKERS', 'BRK-SCHNEIDER-NSX250', 'Breaker NSX250 Schneider', 'Interruptor termomagnetico industrial Schneider', 'pieza'),
    ('seed-supply-breaker-siemens', 'BREAKERS', 'BRK-SIEMENS-3VA250', 'Breaker 3VA250 Siemens', 'Interruptor termomagnetico industrial Siemens', 'pieza'),
    ('seed-supply-breaker-eaton', 'BREAKERS', 'BRK-EATON-MCCB250', 'Breaker MCCB 250A Eaton', 'Interruptor termomagnetico industrial Eaton', 'pieza'),
    ('seed-supply-cable-viakon', 'CABLEADO', 'CBL-VIAKON-30AWG', 'Cableado 3/0 AWG Viakon', 'Cable para distribucion electrica industrial', 'rollo'),
    ('seed-supply-cable-condumex', 'CABLEADO', 'CBL-CONDUMEX-30AWG', 'Cableado 3/0 AWG Condumex', 'Cable para distribucion electrica industrial', 'rollo'),
    ('seed-supply-plc-siemens', 'AUTOMATIZACION', 'PLC-SIEMENS-S71500', 'PLC S7-1500 Siemens', 'PLC industrial para automatizacion', 'pieza'),
    ('seed-supply-automation-abb', 'AUTOMATIZACION', 'AUT-ABB-DRIVE', 'Drive industrial ABB', 'Equipo de automatizacion y control ABB', 'pieza'),
    ('seed-supply-protection-littelfuse', 'PROTECCION', 'PROT-LITTELFUSE-RELAY', 'Relevador de proteccion Littelfuse', 'Relevador de proteccion electrica', 'pieza'),
    ('seed-supply-protection-eaton', 'PROTECCION', 'PROT-EATON-RELAY', 'Relevador de proteccion Eaton', 'Relevador de proteccion electrica', 'pieza')
) AS seed(id, category_code, code, name, description, unit)
JOIN "Category" category
  ON category."code" = seed.category_code
ON CONFLICT ("code") DO UPDATE
SET "categoryId" = EXCLUDED."categoryId",
    "name" = EXCLUDED."name",
    "description" = EXCLUDED."description",
    "unit" = EXCLUDED."unit",
    "updatedAt" = CURRENT_TIMESTAMP,
    "deletedAt" = NULL;

-- Seed engineering project training examples
INSERT INTO "TrainingExample" ("id", "input", "output", "embedding", "aceptado", "createdAt")
VALUES
  (
    'training-project-01',
    $${
      "cliente": "Parque Industrial Norte",
      "sector": "Industrial",
      "descripcion_trabajo": "Diseno e instalacion de sistema de distribucion electrica en nave industrial con multiples lineas de produccion"
    }$$::jsonb,
    $${
      "proyecto": "Sistema de distribucion electrica industrial",
      "soluciones": [
        {
          "tipo": "distribucion electrica",
          "incluyeIngenieria": true,
          "incluyeInstalacion": true,
          "incluyePuestaMarcha": true,
          "incluyeMantenimiento": true,
          "componentes": [
            { "tipo": "material", "nombre": "Tablero de distribucion 400A", "marca": "Schneider", "categoria": "tableros", "costo": 2500 },
            { "tipo": "material", "nombre": "Interruptor termomagnetico 250A", "marca": "Eaton", "categoria": "proteccion", "costo": 600 },
            { "tipo": "material", "nombre": "Cableado 3/0 AWG", "marca": "Viakon", "categoria": "conductores", "costo": 1800 },
            { "tipo": "servicio", "nombre": "Instalacion de sistema de distribucion", "categoria": "instalacion", "costo": 3000 }
          ]
        }
      ]
    }$$::jsonb,
    ARRAY[]::DOUBLE PRECISION[],
    true,
    CURRENT_TIMESTAMP
  ),
  (
    'training-project-02',
    $${
      "cliente": "Planta Embotelladora",
      "sector": "Industrial",
      "descripcion_trabajo": "Automatizacion de linea de produccion con PLC, sensores y monitoreo en tiempo real"
    }$$::jsonb,
    $${
      "proyecto": "Automatizacion de procesos industriales",
      "soluciones": [
        {
          "tipo": "automatizacion",
          "incluyeIngenieria": true,
          "incluyeInstalacion": true,
          "incluyePuestaMarcha": true,
          "incluyeMantenimiento": true,
          "componentes": [
            { "tipo": "material", "nombre": "PLC S7-1500", "marca": "Siemens", "categoria": "control", "costo": 3500 },
            { "tipo": "material", "nombre": "Sensores industriales", "marca": "Omron", "categoria": "sensores", "costo": 1200 },
            { "tipo": "servicio", "nombre": "Programacion y puesta en marcha", "categoria": "ingenieria", "costo": 2000 }
          ]
        }
      ]
    }$$::jsonb,
    ARRAY[]::DOUBLE PRECISION[],
    true,
    CURRENT_TIMESTAMP
  ),
  (
    'training-project-03',
    $${
      "cliente": "Hospital Regional",
      "sector": "Salud",
      "descripcion_trabajo": "Instalacion de sistema electrico redundante con UPS y planta de emergencia"
    }$$::jsonb,
    $${
      "proyecto": "Sistema electrico critico",
      "soluciones": [
        {
          "tipo": "energia critica",
          "incluyeIngenieria": true,
          "incluyeInstalacion": true,
          "incluyePuestaMarcha": true,
          "incluyeMantenimiento": true,
          "componentes": [
            { "tipo": "material", "nombre": "UPS 100 kVA", "marca": "APC", "categoria": "respaldo", "costo": 8000 },
            { "tipo": "material", "nombre": "Planta de emergencia", "marca": "Cummins", "categoria": "generacion", "costo": 15000 },
            { "tipo": "servicio", "nombre": "Integracion de sistema critico", "categoria": "instalacion", "costo": 5000 }
          ]
        }
      ]
    }$$::jsonb,
    ARRAY[]::DOUBLE PRECISION[],
    true,
    CURRENT_TIMESTAMP
  ),
  (
    'training-project-04',
    $${
      "cliente": "Centro Logistico",
      "sector": "Logistica",
      "descripcion_trabajo": "Analisis de calidad de energia y correccion de factor de potencia"
    }$$::jsonb,
    $${
      "proyecto": "Optimizacion de calidad de energia",
      "soluciones": [
        {
          "tipo": "calidad energia",
          "incluyeIngenieria": true,
          "incluyeInstalacion": true,
          "incluyePuestaMarcha": true,
          "incluyeMantenimiento": false,
          "componentes": [
            { "tipo": "material", "nombre": "Banco de capacitores", "marca": "ABB", "categoria": "compensacion", "costo": 3000 },
            { "tipo": "servicio", "nombre": "Estudio de calidad de energia", "categoria": "ingenieria", "costo": 1200 }
          ]
        }
      ]
    }$$::jsonb,
    ARRAY[]::DOUBLE PRECISION[],
    true,
    CURRENT_TIMESTAMP
  ),
  (
    'training-project-05',
    $${
      "cliente": "Aeropuerto Internacional",
      "sector": "Infraestructura",
      "descripcion_trabajo": "Mantenimiento integral de subestacion electrica de media tension"
    }$$::jsonb,
    $${
      "proyecto": "Mantenimiento de subestacion",
      "soluciones": [
        {
          "tipo": "subestacion",
          "incluyeIngenieria": true,
          "incluyeInstalacion": false,
          "incluyePuestaMarcha": true,
          "incluyeMantenimiento": true,
          "componentes": [
            { "tipo": "servicio", "nombre": "Pruebas a transformador", "categoria": "mantenimiento", "costo": 2000 },
            { "tipo": "servicio", "nombre": "Inspeccion de protecciones", "categoria": "mantenimiento", "costo": 1500 }
          ]
        }
      ]
    }$$::jsonb,
    ARRAY[]::DOUBLE PRECISION[],
    true,
    CURRENT_TIMESTAMP
  ),
  (
    'training-project-06',
    $${
      "cliente": "Plaza Comercial",
      "sector": "Retail",
      "descripcion_trabajo": "Instalacion de sistema de iluminacion LED eficiente"
    }$$::jsonb,
    $${
      "proyecto": "Sistema de iluminacion eficiente",
      "soluciones": [
        {
          "tipo": "iluminacion",
          "incluyeIngenieria": true,
          "incluyeInstalacion": true,
          "incluyePuestaMarcha": true,
          "incluyeMantenimiento": false,
          "componentes": [
            { "tipo": "material", "nombre": "Luminarias LED", "marca": "Philips", "categoria": "iluminacion", "costo": 2500 },
            { "tipo": "servicio", "nombre": "Instalacion de luminarias", "categoria": "instalacion", "costo": 1200 }
          ]
        }
      ]
    }$$::jsonb,
    ARRAY[]::DOUBLE PRECISION[],
    true,
    CURRENT_TIMESTAMP
  ),
  (
    'training-project-07',
    $${
      "cliente": "Industria Metalurgica",
      "sector": "Industrial",
      "descripcion_trabajo": "Instalacion de variadores de frecuencia para control de motores"
    }$$::jsonb,
    $${
      "proyecto": "Control de motores electricos",
      "soluciones": [
        {
          "tipo": "automatizacion",
          "incluyeIngenieria": true,
          "incluyeInstalacion": true,
          "incluyePuestaMarcha": true,
          "incluyeMantenimiento": true,
          "componentes": [
            { "tipo": "material", "nombre": "Variador de frecuencia", "marca": "ABB", "categoria": "control", "costo": 1800 },
            { "tipo": "servicio", "nombre": "Configuracion de variador", "categoria": "ingenieria", "costo": 900 }
          ]
        }
      ]
    }$$::jsonb,
    ARRAY[]::DOUBLE PRECISION[],
    true,
    CURRENT_TIMESTAMP
  ),
  (
    'training-project-08',
    $${
      "cliente": "Edificio Corporativo",
      "sector": "Oficinas",
      "descripcion_trabajo": "Instalacion electrica completa en edificio de oficinas"
    }$$::jsonb,
    $${
      "proyecto": "Sistema electrico comercial",
      "soluciones": [
        {
          "tipo": "distribucion electrica",
          "incluyeIngenieria": true,
          "incluyeInstalacion": true,
          "incluyePuestaMarcha": true,
          "incluyeMantenimiento": true,
          "componentes": [
            { "tipo": "material", "nombre": "Tablero general", "marca": "Schneider", "categoria": "tableros", "costo": 3000 },
            { "tipo": "servicio", "nombre": "Cableado e instalacion", "categoria": "instalacion", "costo": 4000 }
          ]
        }
      ]
    }$$::jsonb,
    ARRAY[]::DOUBLE PRECISION[],
    true,
    CURRENT_TIMESTAMP
  )
ON CONFLICT ("id") DO UPDATE
SET "input" = EXCLUDED."input",
    "output" = EXCLUDED."output",
    "aceptado" = EXCLUDED."aceptado";
