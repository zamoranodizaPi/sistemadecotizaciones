# API Endpoints

Prefijo global: `/api`. Todos los endpoints requieren JWT (`Authorization: Bearer`) vía `@UseGuards(JwtAuthGuard, RolesGuard)` en cada controlador, **excepto**: `POST /auth/login` y `GET /company-profile` (branding público, usado por la pantalla de login).

## Auth

- `POST /auth/login`
- `GET /auth/me`
- `GET /auth/users`
- `GET /auth/users/assignable`
- `POST /auth/users`

## Catálogo

- `GET /catalog`
- `GET /catalog/detected-services`
- `POST /catalog/categories`
- `POST /catalog/services`
- `PATCH /catalog/services/:serviceId`
- `POST /catalog/services/:serviceId/clone`
- `POST /catalog/pricing-profiles/bootstrap`
- `PATCH /catalog/services/:serviceId/pricing-profiles`
- `PATCH /catalog/detected-services/:id/status`
- `GET /catalog/exchange-rate`
- `POST /catalog/exchange-rate/refresh`
- `PATCH /catalog/exchange-rate`
- `DELETE /catalog/services/:serviceId` (requiere `password` de administrador en el body)
- `DELETE /catalog/categories/:categoryId` (requiere `password` de administrador)
- `DELETE /catalog` (requiere `password` de administrador)

## Importador (`/imports`)

- `POST /imports/excel/preview`, `POST /imports/excel`, `POST /imports/excel/confirm`
- `POST /imports/clients/preview`, `POST /imports/clients/confirm`
- `POST /imports/activities/preview`, `POST /imports/activities/confirm`
- `GET /imports/excel/export`, `GET /imports/clients/export`, `GET /imports/activities/export`
- `GET /imports/clients/export/data`, `GET /imports/activities/export/data`
- `GET /imports/template/combinada`

Nota: el body de `excel`/`excel/preview` viaja como base64 dentro de JSON, no multipart (ver `docs/review.md`).

## Clientes

- `GET /clients`
- `POST /clients`
- `PATCH /clients/:id`
- `POST /clients/:id/clone`
- `DELETE /clients/:id`

## Cotizaciones

- `GET /quotations`
- `POST /quotations`
- `GET /quotations/template`, `PATCH /quotations/template`
- `PATCH /quotations/:id`, `PATCH /quotations/:id/builder`, `PATCH /quotations/:id/status/:status`, `PATCH /quotations/:id/commercial`
- `POST /quotations/:id/duplicate`
- `POST /quotations/:id/learn`, `POST /quotations/learn-all` (reentrenar `LearnedRule` desde el historial)
- `POST /quotations/:id/mark-sent`, `POST /quotations/:id/mark-viewed`, `POST /quotations/:id/mark-accepted`, `POST /quotations/:id/mark-rejected`
- `POST /quotations/:id/approve-discount`, `POST /quotations/:id/reject-discount`
- `POST /quotations/:id/convert-to-work-order`
- `GET /quotations/:id/activities`, `POST /quotations/:id/activities`
- `POST /quotations/:id/pdf`, `POST /quotations/:id/pdf/simple`
- `POST /quotations/:id/report-word`, `POST /quotations/:id/report-word/suggested`
- `DELETE /quotations/:id`
- Catálogos auxiliares de cotización: `GET/POST/PATCH/DELETE /quotations/service-templates`, `GET/POST/PATCH/DELETE /quotations/work-items/catalog`, `GET/POST/PATCH/DELETE /quotations/reusable-text-blocks`, `GET /quotations/special-considerations/catalog`

## Pipeline

- `GET /pipeline`
- `GET /pipeline/kanban`

## Auditoría

- `GET /audit/quotation-history`

## Métricas

- `GET /metrics/dashboard`

## Perfil de empresa (branding)

- `GET /company-profile` — **público** (sin sesión), usado por la pantalla de login.
- `PATCH /company-profile` — protegido, roles `ADMIN`/`SALES`.

## Asistente de IA (`ai-assistant`)

- `POST /ai/suggest-quote` — motor de tres capas: reglas aprendidas locales → reglas heurísticas → OpenAI (opcional, vía `AiProvider`). Ver `docs/architecture.md`.
- `POST /ai/create-deal`
- `POST /ai/feedback` — retroalimenta `LearnedRule`/`AiFeedback`.

## Aprendizaje de IA (`ai-learning`)

- `GET/POST/PATCH/DELETE /ai-learning/prompts`
- `GET /ai-learning/training`
- `POST /ai-learning/training-free`, `POST /ai-learning/training-dataset`, `POST /ai-learning/training-promote`
- `DELETE /ai-learning/training/:id`

## Proyectos de IA / costeo (`ai-proyectos`)

- `POST /ai/proyecto` — genera un proyecto con soluciones/componentes/costeo.
- `POST /ai/proyecto/training`
- `POST /ai/proyecto/:id/convert-to-quotation`
- `POST /ai/proyecto/:id/pdf`
