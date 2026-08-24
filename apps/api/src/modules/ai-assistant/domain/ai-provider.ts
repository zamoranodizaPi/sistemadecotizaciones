/**
 * Contrato para un proveedor externo de IA capaz de parsear la intencion de
 * una cotizacion y generar una propuesta estructurada.
 *
 * `OpenAiProvider` (infrastructure/providers/openai.provider.ts) es la unica
 * implementacion hoy. El motor local de aprendizaje (`AiLearningService`,
 * con las tablas `LearnedRule`/`AiFeedback`) y el motor de reglas dentro de
 * `IntentParsingService` NO dependen de esta interfaz: siguen respondiendo
 * sin tocar la red cuando hay una regla aprendida o cuando no hay proveedor
 * configurado. Esta interfaz solo aisla el proveedor externo (hoy OpenAI)
 * para poder agregar uno nuevo (Claude via API, un modelo local via Ollama)
 * implementandola, sin tocar la logica de orquestacion/fallback existente.
 */

export type AiProviderIntentResult = {
  category: string | null;
  service: string | null;
  variables: Record<string, number | string>;
  keywords: string[];
  qualifiers: string[];
  confidence: number;
};

export type AiProviderProposalResult = {
  proposal: Record<string, unknown>;
};

export interface AiProvider {
  /** Identificador estable del proveedor, usado para etiquetar la respuesta (UI, logs). */
  getName(): 'openai' | 'anthropic';

  /** true si el proveedor tiene lo necesario (p.ej. una API key) para responder. */
  isAvailable(): boolean;

  parseIntent(
    text: string,
    context?: {
      catalog?: string;
      history?: string;
      learningPrompts?: string;
    },
  ): Promise<AiProviderIntentResult>;

  generateProposal(
    text: string,
    context?: {
      learningPrompts?: string;
    },
  ): Promise<AiProviderProposalResult>;
}

export const AI_PROVIDER = Symbol('AI_PROVIDER');
