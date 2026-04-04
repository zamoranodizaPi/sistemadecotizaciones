# Sistema de Cotizaciones

Monorepo con backend NestJS, frontend Next.js, PostgreSQL, Prisma y Docker para un sistema empresarial de cotizaciones con versionado de precios, pipeline comercial, auditoría y base evolutiva hacia ERP.

## Estructura

- `apps/api`: API NestJS modular
- `apps/web`: frontend Next.js App Router
- `docs`: arquitectura, endpoints, roadmap y revisión

## Inicio rápido

1. Copiar `.env.example` a `.env`
2. Instalar dependencias en raíz y workspaces
3. Ejecutar PostgreSQL con `docker compose up -d postgres`
4. Generar cliente Prisma y migrar esquema
5. Levantar `apps/api` y `apps/web`

## Módulos base

- Catálogo y precios versionados
- Importador Excel
- Clientes y contactos
- Cotizaciones con snapshot
- Generación PDF
- Kanban comercial
- Métricas y auditoría

