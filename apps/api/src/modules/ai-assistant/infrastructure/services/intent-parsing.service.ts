import { Inject, Injectable } from '@nestjs/common';
import { AI_PROVIDER, AiProvider } from '../../domain/ai-provider';

export type ParsedIntent = {
  category: string | null;
  service: string | null;
  variables: Record<string, number | string>;
  keywords: string[];
  qualifiers: string[];
  confidence: number;
  engine: 'openai' | 'rules' | 'local_learning';
  aiStatus:
    | 'openai_ok'
    | 'fallback_no_key'
    | 'fallback_insufficient_quota'
    | 'fallback_openai_error'
    | 'local_rule_match';
};

@Injectable()
export class IntentParsingService {
  constructor(@Inject(AI_PROVIDER) private readonly aiProvider: AiProvider) {}

  async parseQuoteIntent(
    text: string,
    context?: {
      catalog?: string;
      history?: string;
      learningPrompts?: string;
    },
  ): Promise<ParsedIntent> {
    const heuristic = this.parseWithRules(text, 'fallback_no_key');

    if (!this.aiProvider.isAvailable()) {
      return heuristic;
    }

    try {
      const providerResult = await this.aiProvider.parseIntent(text, context);
      return this.mergeParsedIntent(heuristic, {
        ...providerResult,
        engine: 'openai',
        aiStatus: 'openai_ok',
      });
    } catch (error) {
      console.error('AI parse fallback:', error);
      return this.parseWithRules(
        text,
        error instanceof Error && error.message.includes('insufficient_quota')
          ? 'fallback_insufficient_quota'
          : 'fallback_openai_error',
      );
    }
  }

  async generateStructuredProposal(
    text: string,
    context?: {
      learningPrompts?: string;
    },
  ) {
    if (this.aiProvider.isAvailable()) {
      try {
        const result = await this.aiProvider.generateProposal(text, context);
        return {
          engine: 'openai' as const,
          ai_status: 'openai_ok' as const,
          proposal: result.proposal,
        };
      } catch (error) {
        console.error('AI structured fallback:', error);
      }
    }

    return this.generateStructuredProposalWithRules(text);
  }

  private generateStructuredProposalWithRules(text: string) {
    const normalized = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const titleMatch = text.match(/titulo\s*:\s*(.+)/i);
    const title = titleMatch?.[1]?.trim() || 'Servicio eléctrico';
    const servicios = [];

    if (/tablero/.test(normalized)) {
      servicios.push({
        servicio: 'Inspeccion y limpieza de tableros',
        tareas: ['Desmontaje de tapas', 'Limpieza de contactos', 'Verificacion de conexiones'],
        duracion_horas: 3,
      });
    }

    if (/continuidad|aislamiento|proteccion/.test(normalized)) {
      servicios.push({
        servicio: 'Pruebas de continuidad y medicion de aislamiento',
        tareas: ['Medicion con megohmetro', 'Registro de valores', 'Revision de protecciones termicas'],
        duracion_horas: 3,
      });
    }

    servicios.push({
      servicio: 'Ajustes y recomendaciones',
      tareas: ['Ajuste de conexiones flojas', 'Reporte de observaciones', 'Sugerencias de mantenimiento futuro'],
      duracion_horas: 2,
    });

    return {
      engine: 'rules' as const,
      ai_status: 'fallback_no_key' as const,
      proposal: {
        titulo: title,
        servicios_recomendados: servicios,
        costo_estimado: {
          materiales: 200,
          mano_obra: 800,
          total: 1000,
          moneda: 'USD',
        },
        notas: 'Se recomienda validar el alcance final en sitio antes de emitir la cotizacion definitiva.',
      },
    };
  }

  private parseWithRules(
    text: string,
    aiStatus: ParsedIntent['aiStatus'],
  ): ParsedIntent {
    const normalized = text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

    const category = this.detectCategory(normalized);

    const service = this.detectService(normalized);

    const quantityMatch =
      normalized.match(/(\d+)\s*(secciones|tableros|celdas|interruptores|equipos)/) ||
      normalized.match(/(\d+)\s*(seccion|tablero|celda|interruptor|equipo)/);

    const variables: Record<string, number | string> = {};
    if (quantityMatch) {
      variables[quantityMatch[2].startsWith('seccion') ? 'secciones' : quantityMatch[2]] = Number(quantityMatch[1]);
    }
    if (normalized.includes('tablero')) {
      variables.equipo = 'tablero';
    }
    if (category) {
      variables.modelo = category;
    }
    if (service) {
      variables.tipo_servicio = service;
    }

    const keywords = Array.from(
      new Set(
        normalized
          .split(/[^a-z0-9]+/)
          .map((token) => token.trim())
          .filter((token) => token.length > 2),
      ),
    );

    const qualifiers = ['completo', 'completas', 'urgente', 'sitio', 'reporte']
      .filter((entry) => normalized.includes(entry));

    return {
      category,
      service,
      variables,
      keywords,
      qualifiers,
      confidence: category && service ? 0.84 : category || service ? 0.72 : 0.45,
      engine: 'rules',
      aiStatus,
    };
  }

  private mergeParsedIntent(base: ParsedIntent, incoming: ParsedIntent): ParsedIntent {
    return {
      category: incoming.category || base.category,
      service: incoming.service || base.service,
      variables: {
        ...base.variables,
        ...Object.fromEntries(
          Object.entries(incoming.variables || {}).filter(([, value]) => value !== null && value !== undefined && value !== ''),
        ),
      },
      keywords: Array.from(new Set([...base.keywords, ...(incoming.keywords || [])])),
      qualifiers: Array.from(new Set([...base.qualifiers, ...(incoming.qualifiers || [])])),
      confidence: Math.max(base.confidence, incoming.confidence || 0),
      engine: incoming.engine,
      aiStatus: incoming.aiStatus,
    };
  }

  private detectCategory(normalized: string) {
    if (normalized.includes('minigear')) {
      return 'SWBG';
    }
    if (normalized.includes('34.5kv') || normalized.includes('34.5 kv') || normalized.includes('34.5v')) {
      return 'SWBG';
    }
    if (/\bccm\b/.test(normalized) || normalized.includes('centro de control de motores')) {
      return 'CCM';
    }
    if (/\bswbg\b/.test(normalized) || normalized.includes('switchgear')) {
      return 'SWBG';
    }
    if (normalized.includes('metalc')) {
      return 'METALC';
    }
    if (normalized.includes('base')) {
      return 'BASE';
    }
    if (normalized.includes('tablero')) {
      return 'TABLERO';
    }
    if (normalized.includes('subestacion')) {
      return 'SUBESTACION';
    }

    return null;
  }

  private detectService(normalized: string) {
    if (normalized.includes('pruebas y puesta en marcha')) {
      return 'pruebas y puesta en marcha';
    }
    if (normalized.includes('puesta en servicio')) {
      return 'pruebas y puesta en marcha';
    }
    if (normalized.includes('pruebas completas')) {
      return 'pruebas completas';
    }
    if (normalized.includes('puesta en marcha')) {
      return 'puesta en marcha';
    }
    if (normalized.includes('pruebas')) {
      return 'pruebas';
    }
    if (normalized.includes('configuracion') || normalized.includes('configurar')) {
      return 'configuracion';
    }
    if (normalized.includes('mantenimiento')) {
      return 'mantenimiento';
    }
    if (normalized.includes('diagnostico')) {
      return 'diagnostico';
    }
    if (normalized.includes('puesta en marcha')) {
      return 'puesta en marcha';
    }

    return null;
  }
}
