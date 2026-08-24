# Arquitectura

## Estilo

- Monolito modular sobre NestJS (`apps/api`) + Next.js App Router como frontend (`apps/web`).
- Prisma como adaptador de persistencia sobre PostgreSQL.
- Cada módulo bajo `apps/api/src/modules/*` sigue la carpeta `domain/application/infrastructure/presentation`, pero **hoy la mayoría del código real vive en `infrastructure/services/*.service.ts` (lógica de negocio) y `presentation/controllers/*.controller.ts`** (endpoints REST), con `application/dto/*.dto.ts` para los contratos de entrada/salida. La capa `domain/` es en su mayoría un scaffold vacío heredado del diseño original — no una Clean Architecture completa todavía. Los módulos `ai-assistant` (`domain/ai-provider.ts`) y `shared` (`domain/text-similarity.ts`) son los primeros con uso real de esa capa: interfaces/funciones puras sin dependencia de NestJS ni de Prisma.
- No asumas que un módulo tiene use-cases separados de su service: en la práctica, un `XxxService` hace de use-case + repositorio a la vez, hablando directo con `PrismaService`.

## Módulos reales (`apps/api/src/modules/*`)

- `auth`: login (JWT, `scrypt`+`timingSafeEqual` para contraseñas), guard global por controlador (`@UseGuards(JwtAuthGuard, RolesGuard)`, no hay `APP_GUARD` global), admin de bootstrap configurable por env (`BOOTSTRAP_ADMIN_EMAIL`/`PASSWORD`).
- `catalog`: categorías, suministros (`Supply`), precios versionados (`SupplyPrice`, `SupplyPricingProfile`), importador/exportador Excel.
- `clients`: empresas y contactos.
- `quotations`: creación con snapshot inmutable, folio con retry-on-conflict, PDF (Puppeteer), reporte Word (`docx`), historial, kanban/pipeline.
- `pipeline`: etapas del kanban comercial.
- `audit`: eventos de negocio.
- `metrics`: KPIs de dirección comercial.
- `company-profile`: branding (nombre/logo de empresa). El `GET` es público a propósito porque lo usa la pantalla de login sin sesión.
- `ai-assistant`: asistente de sugerencia de cotizaciones. Ver sección "Motor de IA" abajo.
- `ai-learning`: motor de aprendizaje local (`LearnedRule`, `AiFeedback`, `AiLearningPrompt`) — 100% local, no depende de ningún proveedor externo.
- `ai-proyectos`: motor de costeo/BOM (`Proyecto`/`Solucion`/`Componente`/`Material`/`ManoObra`/`FactorCosto`) con su propia búsqueda por embeddings sobre `TrainingExample`. Es un pipeline paralelo al de `ai-assistant`/`ai-learning`: nunca escribe en `LearnedRule`/`AiFeedback` ni las lee. Integrado con `quotations` (`convertirProyectoToQuotation`), pero es una "memoria de IA" separada.
- `shared`: `PrismaService`/`PrismaModule` + utilidades de dominio puras (`shared/domain/text-similarity.ts`).

## Motor de IA — cómo depender cada vez menos de la API externa

El asistente (`ai-assistant`) tiene tres motores reales, no solo uno:

1. **`local_learning`** (`ai-learning`): busca en `LearnedRule` una coincidencia (score Jaccard/keyword ≥ 0.55) contra cotizaciones/feedback previos. Si hay match, responde **sin tocar la red**.
2. **`rules`**: heurísticas locales (regex/keywords) en `intent-parsing.service.ts`, siempre se calculan como base.
3. **`openai`** (opcional): solo se intenta si no hubo match local y hay `OPENAI_API_KEY` configurada; si falla o no hay key, cae a `rules` sin romper el flujo.

Cada cotización creada/editada (`quotations.service.ts` → `recordQuotationLearning`) y cada corrección del usuario (`POST /api/ai/feedback`) alimentan `LearnedRule`, así que el sistema depende cada vez menos de la API externa mientras más se usa — esto ya funciona hoy, no es una promesa a futuro.

**Punto de extensión `AiProvider`** (`ai-assistant/domain/ai-provider.ts`): el acceso a OpenAI está detrás de una interfaz (`parseIntent`, `generateProposal`, `isAvailable`) implementada hoy por `OpenAiProvider` (`ai-assistant/infrastructure/providers/openai.provider.ts`) e inyectada vía el token `AI_PROVIDER` en `ai-assistant.module.ts`. Para agregar un segundo proveedor (Claude vía API, o un modelo local vía Ollama/llama.cpp más adelante) solo hace falta implementar esa interfaz y registrarla — no se toca `intent-parsing.service.ts` ni el resto del pipeline. `ai-proyectos.service.ts` todavía llama a OpenAI directo (no pasa por esta interfaz); es candidato a una segunda fase de esta misma abstracción.

## Decisiones clave

- Las cotizaciones se modelan como snapshot inmutable para aislarse del catálogo vivo.
- Los precios son append-only con vigencia temporal.
- El importador de Excel nunca reescribe servicios ni precios previos.
- Se usa `deletedAt` para soft delete en tablas de catálogo y clientes.
- El folio de cotización (`COT.####-YYYY`) usa retry-on-conflict contra un constraint único en base de datos, no un `count()` ingenuo.
- El import de Excel viaja como base64 dentro del body JSON (no multipart); `main.ts` sube explícitamente el límite del body parser para acomodar archivos reales.
