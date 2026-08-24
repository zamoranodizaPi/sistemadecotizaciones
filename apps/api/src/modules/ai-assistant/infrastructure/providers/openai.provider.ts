import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AiProvider,
  AiProviderIntentResult,
  AiProviderProposalResult,
} from '../../domain/ai-provider';

/**
 * Implementacion de AiProvider sobre la API de OpenAI (endpoint
 * `/v1/responses`), extraida tal cual de intent-parsing.service.ts para
 * aislar el acoplamiento a este proveedor externo detras de la interfaz
 * AiProvider.
 */
@Injectable()
export class OpenAiProvider implements AiProvider {
  constructor(private readonly configService: ConfigService) {}

  isAvailable(): boolean {
    return Boolean(this.configService.get<string>('OPENAI_API_KEY'));
  }

  async parseIntent(
    text: string,
    context?: {
      catalog?: string;
      history?: string;
      learningPrompts?: string;
    },
  ): Promise<AiProviderIntentResult> {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY no configurada.');
    }

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

    const confidence = typeof parsedRaw.confidence === 'number' ? parsedRaw.confidence : 0.7;

    return {
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
      confidence: Math.max(0, Math.min(1, confidence)),
    };
  }

  async generateProposal(
    text: string,
    context?: {
      learningPrompts?: string;
    },
  ): Promise<AiProviderProposalResult> {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY no configurada.');
    }

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
      proposal: JSON.parse(payload.output_text || '{}') as Record<string, unknown>,
    };
  }
}
