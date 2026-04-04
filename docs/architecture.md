# Arquitectura

## Estilo

- Modular Monolith sobre NestJS
- Clean Architecture por módulo
- Prisma como adaptador de persistencia
- Next.js App Router como BFF visual del sistema

## Capas

- `domain`: entidades, enums y contratos
- `application`: casos de uso y DTOs
- `infrastructure`: Prisma, Excel, PDF, auth
- `presentation`: controladores REST y view models

## Módulos

- `catalog`: categorías, servicios, versionado de precios e importación Excel
- `clients`: empresas y contactos
- `quotations`: creación, snapshot, PDF e historial
- `pipeline`: estados Kanban y tracking operativo
- `audit`: eventos de negocio
- `metrics`: KPIs de dirección comercial
- `auth/users/roles`: seguridad base con JWT + RBAC

## Decisiones clave

- Las cotizaciones se modelan como snapshot inmutable para aislarse del catálogo vivo.
- Los precios son append-only con vigencia temporal.
- El importador de Excel nunca reescribe servicios ni precios previos.
- Se usa `deletedAt` para soft delete en tablas de catálogo y clientes.

