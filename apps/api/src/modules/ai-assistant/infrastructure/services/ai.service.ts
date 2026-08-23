import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type ParsedIntent = {
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
export class AiService {
  constructor(private readonly configService: ConfigService) {}

  async parseQuoteIntent(
    text: string,
    context?: {
      catalog?: string;
      history?: string;
      learningPrompts?: string;
    },
  ): Promise<ParsedIntent> {
    const heuristic = this.parseWithRules(text, 'fallback_no_key');
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');

    if (apiKey) {
      try {
        const openAiResult = await this.parseWithOpenAi(text, apiKey, context);
        return this.mergeParsedIntent(heuristic, openAiResult);
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

    return heuristic;
  }

  async generateStructuredProposal(
    text: string,
    context?: {
      learningPrompts?: string;
    },
  ) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (apiKey) {
      try {
        return await this.generateStructuredProposalWithOpenAi(text, apiKey, context);
      } catch (error) {
        console.error('AI structured fallback:', error);
      }
    }

    return this.generateStructuredProposalWithRules(text);
  }

  private async parseWithOpenAi(
    text: string,
    apiKey: string,
    context?: {
      catalog?: string;
      history?: string;
      learningPrompts?: string;
    },
  ): Promise<ParsedIntent> {
    const model = this.configService.get<string>('OPENAI_AI_ASSISTANT_MODEL') || 'gpt-4.1-mini';
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: 'system',
            content: [
              {
                type: 'input_text',
                text:
                  `Eres un asistente técnico especializado en servicios eléctricos industriales. NO inventes servicios y devuelve solo JSON válido y conciso.${context?.learningPrompts ? `\n\nPrompts de aprendizaje activos:\n${context.learningPrompts}` : ''}`,
              },
            ],
          },
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: `Catálogo disponible:\n${context?.catalog || 'Sin catálogo disponible'}\n\nHistorial de cotizaciones:\n${context?.history || 'Sin historial disponible'}\n\nTexto del usuario:\n${text}\n\nDevuelve JSON con:\n- category\n- service\n- variables\n- keywords\n- qualifiers\n- confidence`,
              },
            ],
          },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'quote_intent',
            strict: false,
            schema: {
              type: 'object',
              additionalProperties: true,
              properties: {
                category: { type: ['string', 'null'] },
                service: { type: ['string', 'null'] },
                variables: {
                  type: 'object',
                  additionalProperties: true,
                },
                keywords: {
                  type: 'array',
                  items: { type: 'string' },
                },
                qualifiers: {
                  type: 'array',
                  items: { type: 'string' },
                },
                confidence: { type: 'number' },
              },
            },
          },
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI parse failed: ${response.status} ${await response.text()}`);
    }

    const payload = (await response.json()) as { output_text?: string };
    let parsedRaw: Record<string, unknown> = {};

    if (payload.output_text) {
      try {
        parsedRaw = JSON.parse(payload.output_text);
      } catch {
        parsedRaw = {};
      }
    }

    const parsed = {
      category: typeof parsedRaw.category === 'string' ? parsedRaw.category : null,
      service: typeof parsedRaw.service === 'string' ? parsedRaw.service : null,
      variables:
        typeof parsedRaw.variables === 'object' && parsedRaw.variables !== null
          ? (parsedRaw.variables as Record<string, string | number>)
          : {},
      keywords: Array.isArray(parsedRaw.keywords)
        ? (parsedRaw.keywords.filter((item) => typeof item === 'string') as string[])
        : [],
      qualifiers: Array.isArray(parsedRaw.qualifiers)
        ? (parsedRaw.qualifiers.filter((item) => typeof item === 'string') as string[])
        : [],
      confidence: typeof parsedRaw.confidence === 'number' ? parsedRaw.confidence : 0.7,
    } as ParsedIntent;

    return {
      category: parsed.category || null,
      service: parsed.service || null,
      variables: parsed.variables || {},
      keywords: parsed.keywords || [],
      qualifiers: parsed.qualifiers || [],
      confidence: Math.max(0, Math.min(1, parsed.confidence)),
      engine: 'openai',
      aiStatus: 'openai_ok',
    };
  }

  private async generateStructuredProposalWithOpenAi(
    text: string,
    apiKey: string,
    context?: {
      learningPrompts?: string;
    },
  ) {
    const model = this.configService.get<string>('OPENAI_AI_ASSISTANT_MODEL') || 'gpt-4.1-mini';
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: 'system',
            content: [
              {
                type: 'input_text',
                text: `Genera una propuesta técnica estructurada en JSON para servicios eléctricos. No devuelvas texto libre.${context?.learningPrompts ? `\n\nPrompts de aprendizaje activos:\n${context.learningPrompts}` : ''}`,
              },
            ],
          },
          {
            role: 'user',
            content: [{ type: 'input_text', text }],
          },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'structured_quote',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                servicios_recomendados: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      servicio: { type: 'string' },
                      tareas: { type: 'array', items: { type: 'string' } },
                      duracion_horas: { type: 'number' },
                    },
                    required: ['servicio', 'tareas', 'duracion_horas'],
                  },
                },
                costo_estimado: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    materiales: { type: 'number' },
                    mano_obra: { type: 'number' },
                    total: { type: 'number' },
                    moneda: { type: 'string' },
                  },
                  required: ['materiales', 'mano_obra', 'total', 'moneda'],
                },
                notas: { type: 'string' },
              },
              required: ['servicios_recomendados', 'costo_estimado', 'notas'],
            },
          },
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI structured failed: ${response.status} ${await response.text()}`);
    }

    const payload = (await response.json()) as { output_text?: string };
    return {
      engine: 'openai' as const,
      ai_status: 'openai_ok' as const,
      proposal: JSON.parse(payload.output_text || '{}') as Record<string, unknown>,
    };
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
