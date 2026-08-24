import { Injectable, Logger } from '@nestjs/common';
import { appendFile, mkdir } from 'fs/promises';
import { dirname, resolve } from 'path';

/**
 * Escribe logs JSONL de observabilidad para el aprendizaje de IA
 * (comparaciones de sugerencias, cotizaciones aprendidas) bajo
 * `storage/ai-learning/`. Falla en silencio (solo loguea el error): estos
 * archivos son de diagnostico, no deben tumbar el flujo de negocio.
 *
 * La ruta se resuelve relativa a `process.cwd()` sin asumir un prefijo
 * `apps/api/`: el proceso siempre corre con cwd en la raiz de `apps/api`
 * (asi arranca tanto `npm run dev -w apps/api` como el Dockerfile, cuyo
 * WORKDIR es el contenido de `apps/api`). Anteponer `apps/api/` aqui
 * duplicaba el path y generaba `apps/api/apps/api/storage/...`.
 */
@Injectable()
export class AiLearningLogService {
  private readonly logger = new Logger(AiLearningLogService.name);

  async append(fileName: string, entry: Record<string, unknown>): Promise<void> {
    try {
      const filePath = resolve(process.cwd(), 'storage', 'ai-learning', fileName);
      await mkdir(dirname(filePath), { recursive: true });
      await appendFile(filePath, `${JSON.stringify(entry)}\n`, 'utf8');
    } catch (error) {
      this.logger.error(`No se pudo escribir en ${fileName}`, error instanceof Error ? error.stack : error);
    }
  }
}
