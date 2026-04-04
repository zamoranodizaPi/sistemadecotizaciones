# Revisión Técnica

## Hallazgos resueltos en esta iteración

- Se evitó que el importador Excel sobrescriba los metadatos de un servicio existente.
- La cotización almacena snapshot por ítem con `serviceCode`, `serviceName`, `categoryName` y `priceVersionId`.
- El historial de cotización registra creación y cambios de estado.
- Se usó `deletedAt` para soft delete en entidades maestras.

## Riesgos actuales

- El login está simplificado y requiere hash/verificación real de contraseña.
- Falta guard global JWT y decorators RBAC por endpoint.
- El folio por conteo total funciona para MVP pero debe reemplazarse por secuencia transaccional en producción.
- La subida de Excel hoy entra como base64; conviene moverla a multipart para archivos grandes.
- Puppeteer dentro de Docker puede requerir ajuste de dependencias del sistema según el host.

## Recomendaciones de siguiente refactor

- Introducir interfaces de repositorio por módulo y adaptadores Prisma explícitos.
- Mover lógica de creación de folio y pricing a servicios de dominio.
- Separar comandos y queries para lectura intensiva de métricas.
- Agregar pruebas de integración para importación/versionado y snapshot de cotizaciones.
- Incorporar paginación, filtros e índices adicionales por `folio`, `rfc` y `status`.

