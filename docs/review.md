# Revisión Técnica

## Hallazgos resueltos en esta iteración

- Se evitó que el importador Excel sobrescriba los metadatos de un servicio existente.
- La cotización almacena snapshot por ítem con `serviceCode`, `serviceName`, `categoryName` y `priceVersionId`.
- El historial de cotización registra creación y cambios de estado.
- Se usó `deletedAt` para soft delete en entidades maestras.
- **Seguridad**: se eliminó la contraseña de administrador hardcodeada en texto plano en `auth.service.ts` (se devolvía además en el body de `POST /auth/login`); ahora se configura por `.env` (`BOOTSTRAP_ADMIN_EMAIL`/`BOOTSTRAP_ADMIN_PASSWORD`) o se genera una temporal impresa solo en consola del servidor. `JWT_SECRET` ya no tiene fallback silencioso a `"change_me"`: la API falla al arrancar si no está configurado.
- **Migraciones**: se consolidaron 36 migraciones (varias duplicadas o con timestamps anidados por corridas repetidas de `prisma migrate dev`) en una sola migración `init` limpia, verificada con `prisma migrate deploy` contra una base vacía.
- **Bug de path real**: el logger JSONL de comparación de sugerencias de IA resolvía su ruta como `process.cwd() + 'apps/api/storage/...'`, pero el proceso ya corre con `cwd = apps/api` — generaba `apps/api/apps/api/storage/...` (encontrado como basura real en el árbol de trabajo). Corregido y centralizado en `AiLearningLogService`.
- **Patrón "escribe en una lectura"**: `GET /catalog` y `GET /quotations/work-items/catalog` disparaban una sincronización completa de `ActivityCatalog` → categoría `ACT` en cada listado. Se movió esa sincronización a los write-paths reales (import Excel, alta/edición de actividades) y los `GET` ya no escriben.
- Higiene de repo: ~989 archivos `._*` (AppleDouble, de una copia previa desde macOS) limpiados y agregados a `.gitignore`; se borraron los módulos `roles`/`users` (carpetas vacías, no importadas, sin funcionalidad real — la gestión de usuarios vive en `auth`).

## Correcciones a hallazgos previos (ya no vigentes)

Dos riesgos de la revisión anterior ya no describen el código actual:

- ~~"El login está simplificado y requiere hash/verificación real de contraseña"~~ — `auth.service.ts` ya usa `scrypt` + `timingSafeEqual` (comparación en tiempo constante) correctamente.
- ~~"El folio por conteo total funciona para MVP pero debe reemplazarse por secuencia transaccional"~~ — el folio ya usa retry-on-conflict contra un constraint único de base de datos (`isFolioUniqueConflict` + reintento), no un `count()` ingenuo. Sigue sin ser una secuencia atómica de BD (`SELECT ... FOR UPDATE`), pero el riesgo de colisión real ya está mitigado.

## Riesgos actuales

- Falta guard global JWT (`APP_GUARD`) — hoy cada uno de los 12 controladores reales aplica `@UseGuards` manualmente y todos lo tienen correctamente, pero un controlador nuevo que lo olvide quedaría abierto sin que nada lo detecte automáticamente.
- La subida de Excel entra como base64 en el body JSON; se subió explícitamente el límite del body parser (`main.ts`) como mitigación de corto plazo, pero migrar a multipart real sigue pendiente para archivos grandes.
- Puppeteer dentro de Docker: el `Dockerfile` ya instala las librerías de sistema necesarias para lanzar Chromium (antes solo tenía `openssl`/`ca-certificates`), pero no se ha verificado un build+run real en un host limpio.
- `ai-proyectos.service.ts` sigue llamando a OpenAI directo (no pasa por la interfaz `AiProvider` introducida en `ai-assistant`) — es candidato a una segunda fase de esa misma abstracción.
- Dos sistemas de aprendizaje de IA conviven sin cruzarse: `LearnedRule`/`AiFeedback` (ai-assistant/ai-learning, basado en reglas) y `TrainingExample`+embeddings (ai-proyectos). Ambos alimentan `Quotation`, pero ninguno informa al otro. Es una decisión de producto/arquitectura pendiente, no un bug.
- La capa `domain/` de la mayoría de los módulos (`catalog`, `clients`, `quotations`, `pipeline`, `audit`, `metrics`, `auth`) sigue siendo un scaffold vacío — la Clean Architecture descrita en `docs/architecture.md` es aspiracional para esos módulos, no el estado real. `ai-assistant/domain/ai-provider.ts` y `shared/domain/text-similarity.ts` son los primeros usos reales de esa capa.

## Recomendaciones de siguiente refactor

- Introducir interfaces de repositorio por módulo y adaptadores Prisma explícitos (o aceptar formalmente que el estilo actual es "service = use-case + repositorio" y ajustar la documentación en vez de perseguir una capa `domain/` completa sin valor inmediato claro).
- Separar comandos y queries para lectura intensiva de métricas.
- Agregar pruebas de integración para importación/versionado y snapshot de cotizaciones (hoy no hay suite de tests automatizados visible en el repo).
- Incorporar paginación, filtros e índices adicionales por `folio`, `rfc` y `status`.
- Evaluar si conviene unificar (o al menos hacer que se informen entre sí) los dos sistemas de aprendizaje de IA.
- Migrar el import de Excel a multipart real.
