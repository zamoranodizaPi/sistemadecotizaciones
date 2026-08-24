import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AiProvider,
  AiProviderIntentResult,
  AiProviderProposalResult,
} from '../../domain/ai-provider';

const ANTHROPIC_VERSION = '2023-06-01';

type AnthropicToolUseBlock = {
  type: 'tool_use';
  name: string;
  input: Record<string, unknown>;
};

/**
 * Implementacion de AiProvider sobre la API de Claude (Anthropic Messages
 * API, https://api.anthropic.com/v1/messages), usando "tool use" forzado
 * para obtener JSON estructurado de forma confiable (equivalente al
 * json_schema de OpenAiProvider).
 */
@Injectable()
export class AnthropicProvider implements AiProvider {
  constructor(private readonly configService: ConfigService) {}

  getName(): 'anthropic' {
    return 'anthropic';
  }

  isAvailable(): boolean {
    return Boolean(this.configService.get<string>('ANTHROPIC_API_KEY'));
  }

  private getModel(): string {
    return this.configService.get<string>('ANTHROPIC_AI_ASSISTANT_MODEL') || 'claude-haiku-4-5-20251001';
  }

  private async callTool(input: {
    apiKey: string;
    model: string;
    maxTokens: number;
    system: string;
    userText: string;
    toolName: string;
    toolDescription: string;
    inputSchema: Record<string, unknown>;
  }): Promise<Record<string, unknown>> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': input.apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: input.model,
        max_tokens: input.maxTokens,
        system: input.system,
        messages: [{ role: 'user', content: input.userText }],
        tools: [
          {
            name: input.toolName,
            description: input.toolDescription,
            input_schema: input.inputSchema,
          },
        ],
        tool_choice: { type: 'tool', name: input.toolName },
      }),
    });

    if (!response.ok) {
      throw new Error(`Anthropic call failed: ${response.status} ${await response.text()}`);
    }

    const payload = (await response.json()) as { content?: unknown[] };
    const toolUse = (payload.content || []).find(
      (block): block is AnthropicToolUseBlock =>
        Boolean(block) && typeof block === 'object' && (block as { type?: string }).type === 'tool_use',
    );

    if (!toolUse) {
      throw new Error('Anthropic no devolvió un bloque tool_use.');
    }

    return toolUse.input;
  }

  async parseIntent(
    text: string,
    context?: {
      catalog?: string;
      history?: string;
      learningPrompts?: string;
    },
  ): Promise<AiProviderIntentResult> {
    const apiKey = this.configService.get<string>('ANTHROPIC_API_KEY');
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY no configurada.');
    }

    const raw = await this.callTool({
      apiKey,
      model: this.getModel(),
      maxTokens: 1024,
      system:
        `Eres un asistente técnico especializado en servicios eléctricos industriales. NO inventes servicios; usa la herramienta con datos concisos y fieles al texto del usuario.${context?.learningPrompts ? `\n\nPrompts de aprendizaje activos:\n${context.learningPrompts}` : ''}`,
      userText: `Catálogo disponible:\n${context?.catalog || 'Sin catálogo disponible'}\n\nHistorial de cotizaciones:\n${context?.history || 'Sin historial disponible'}\n\nTexto del usuario:\n${text}`,
      toolName: 'registrar_intencion_cotizacion',
      toolDescription: 'Registra la intención detectada en el texto de una solicitud de cotización.',
      inputSchema: {
        type: 'object',
        properties: {
          category: { type: ['string', 'null'] },
          service: { type: ['string', 'null'] },
          variables: { type: 'object' },
          keywords: { type: 'array', items: { type: 'string' } },
          qualifiers: { type: 'array', items: { type: 'string' } },
          confidence: { type: 'number' },
        },
        required: ['category', 'service', 'variables', 'keywords', 'qualifiers', 'confidence'],
      },
    });

    const confidence = typeof raw.confidence === 'number' ? raw.confidence : 0.7;

    return {
      category: typeof raw.category === 'string' ? raw.category : null,
      service: typeof raw.service === 'string' ? raw.service : null,
      variables:
        typeof raw.variables === 'object' && raw.variables !== null
          ? (raw.variables as Record<string, string | number>)
          : {},
      keywords: Array.isArray(raw.keywords)
        ? (raw.keywords.filter((item) => typeof item === 'string') as string[])
        : [],
      qualifiers: Array.isArray(raw.qualifiers)
        ? (raw.qualifiers.filter((item) => typeof item === 'string') as string[])
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
    const apiKey = this.configService.get<string>('ANTHROPIC_API_KEY');
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY no configurada.');
    }

    const raw = await this.callTool({
      apiKey,
      model: this.getModel(),
      maxTokens: 2048,
      system: `Genera una propuesta técnica estructurada para servicios eléctricos usando la herramienta. No devuelvas texto libre fuera de ella.${context?.learningPrompts ? `\n\nPrompts de aprendizaje activos:\n${context.learningPrompts}` : ''}`,
      userText: text,
      toolName: 'registrar_propuesta_tecnica',
      toolDescription: 'Registra la propuesta técnica estructurada (servicios recomendados, costo estimado, notas).',
      inputSchema: {
        type: 'object',
        properties: {
          servicios_recomendados: {
            type: 'array',
            items: {
              type: 'object',
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
    });

    return { proposal: raw };
  }
}
