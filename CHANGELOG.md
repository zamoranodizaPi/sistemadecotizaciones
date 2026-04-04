# Changelog

## v0.1.0 - 2026-04-04

Primer corte funcional del CRM de cotizaciones SIEZA.

### Incluye

- CRM comercial con pipeline Kanban para cotizaciones.
- Gestión de clientes, catálogo de servicios y usuarios con roles.
- Importador y exportador Excel para catálogo.
- Versionado de precios y tipo de cambio configurable.
- Generación de PDF completo y PDF simplificado.
- Flujo de cotización por pasos con conceptos, consideraciones, trabajos a realizar y condiciones.
- Dashboard con forecast, métricas y exportación de resumen.
- Branding inicial de SIEZA en login, sidebar y documentos.

### Módulos principales

- `Pipeline`
- `Forecast`
- `Cotizaciones`
- `Clientes`
- `Catálogo`
- `Usuarios`
- `Configuración`
- `Importador`

### Backend

- NestJS + Prisma + PostgreSQL.
- Auth con JWT y roles `ADMIN`, `EDITOR`, `VIEWER`.
- Pipeline comercial, actividades, auditoría y métricas.
- Importación de catálogo con preview editable.
- Exportación Excel para mantenimiento masivo de servicios.

### Frontend

- Next.js App Router.
- UI SaaS con sidebar, topbar y vistas operativas.
- Kanban comercial con identificación visual por cliente.
- Gestión de clientes y usuarios en vistas completas.
- Cotización guiada con preview antes de guardar.

### PDFs

- PDF completo con paginación controlada.
- PDF simplificado con mismas secciones comerciales.
- Footer corporativo y continuidad visual entre páginas.

### Notas

- Este tag corresponde al estado publicado como `v0.1.0`.
- Repositorio remoto: `origin/main`
- Tag remoto: `v0.1.0`
