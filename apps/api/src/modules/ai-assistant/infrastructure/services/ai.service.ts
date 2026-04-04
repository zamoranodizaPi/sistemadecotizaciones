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
    },
  ): Promise<ParsedIntent> {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');

    if (apiKey) {
      try {
        return await this.parseWithOpenAi(text, apiKey, context);
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

    return this.parseWithRules(text, 'fallback_no_key');
  }

  private async parseWithOpenAi(
    text: string,
    apiKey: string,
    context?: {
      catalog?: string;
      history?: string;
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
                  'Eres un asistente técnico especializado en servicios eléctricos industriales. NO inventes servicios y devuelve solo JSON válido y conciso.',
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
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                category: { type: ['string', 'null'] },
                service: { type: ['string', 'null'] },
                variables: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    secciones: { type: ['number', 'null'] },
                    cantidad: { type: ['number', 'null'] },
                    equipo: { type: ['string', 'null'] },
                    modelo: { type: ['string', 'null'] },
                    tipo_servicio: { type: ['string', 'null'] },
                  },
                  required: ['secciones', 'cantidad', 'equipo', 'modelo', 'tipo_servicio'],
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
              required: ['category', 'service', 'variables', 'keywords', 'qualifiers', 'confidence'],
            },
          },
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI parse failed: ${response.status} ${await response.text()}`);
    }

    const payload = (await response.json()) as { output_text?: string };
    const parsed = JSON.parse(payload.output_text || '{}') as ParsedIntent;

    return {
      category: parsed.category || null,
      service: parsed.service || null,
      variables: parsed.variables || {},
      keywords: parsed.keywords || [],
      qualifiers: parsed.qualifiers || [],
      confidence: Math.max(0, Math.min(1, parsed.confidence || 0.7)),
      engine: 'openai',
      aiStatus: 'openai_ok',
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

    const category =
      ['ccm', 'swbg', 'switchgear', 'tablero', 'subestacion', 'relevador', 'transformador'].find((entry) =>
        normalized.includes(entry),
      ) || null;

    const service =
      [
        'pruebas completas',
        'pruebas',
        'configuracion',
        'mantenimiento',
        'diagnostico',
        'puesta en marcha',
      ].find((entry) => normalized.includes(entry)) || null;

    const quantityMatch =
      normalized.match(/(\d+)\s*(secciones|tableros|celdas|interruptores|equipos)/) ||
      normalized.match(/(\d+)\s*(seccion|tablero|celda|interruptor|equipo)/);

    const variables: Record<string, number | string> = {};
    if (quantityMatch) {
      variables[quantityMatch[2].startsWith('seccion') ? 'secciones' : quantityMatch[2]] = Number(quantityMatch[1]);
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
      category: category?.toUpperCase() || null,
      service,
      variables,
      keywords,
      qualifiers,
      confidence: category || service ? 0.72 : 0.45,
      engine: 'rules',
      aiStatus,
    };
  }
}
