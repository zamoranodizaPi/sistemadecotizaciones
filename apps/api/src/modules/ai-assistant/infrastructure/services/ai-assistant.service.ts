import { BadRequestException, Injectable } from '@nestjs/common';
import { AiLearningService } from '../../../ai-learning/infrastructure/services/ai-learning.service';
import { PrismaService } from '../../../../shared/infrastructure/prisma.service';
import { QuotationsService } from '../../../quotations/infrastructure/services/quotations.service';
import { AiService } from './ai.service';

@Injectable()
export class AiAssistantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
    private readonly aiLearningService: AiLearningService,
    private readonly quotationsService: QuotationsService,
  ) {}

  async suggestQuote(text: string) {
    const input = text.trim();
    if (!input) {
      throw new BadRequestException('El texto es obligatorio.');
    }

    const services = await this.prisma.service.findMany({
      where: { deletedAt: null },
      include: {
        category: true,
        pricingProfiles: {
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const historySnapshot = await this.loadRecentHistorySnapshot();
    const localMatch = await this.aiLearningService.findBestRule(input);
    const parsed = localMatch
      ? {
          category: localMatch.category,
          service: localMatch.service,
          variables: localMatch.variables,
          keywords: this.extractKeywords(input),
          qualifiers: [],
          confidence: localMatch.confidence,
          engine: 'local_learning' as const,
          aiStatus: 'local_rule_match' as const,
        }
      : await this.aiService.parseQuoteIntent(input, {
          catalog: this.buildCatalogSnapshot(services),
          history: historySnapshot,
        });

    const similarQuotations = await this.findSimilarQuotations(input, parsed);
    const candidateServices = this.rankServices(
      services,
      parsed,
      input,
      localMatch?.suggestedServices || [],
    );
    const suggestedItems = this.buildSuggestedItems(
      candidateServices,
      similarQuotations,
      parsed,
      input,
      localMatch?.suggestedServices || [],
    );
    const confidence =
      parsed.engine === 'local_learning'
        ? parsed.confidence
        : this.calculateConfidence(parsed.confidence, candidateServices.length, similarQuotations.length);
    const missingFields = this.resolveMissingFields(parsed, suggestedItems);

    if (parsed.engine !== 'local_learning') {
      await this.aiLearningService.learnFromSuggestion({
        inputText: input,
        category: parsed.category,
        service: parsed.service,
        variables: parsed.variables,
        suggestedServices: suggestedItems.map((item) => item.service),
        confidence,
      });
    }

    return {
      engine: parsed.engine,
      ai_status: parsed.aiStatus,
      detected: {
        category: parsed.category,
        service: parsed.service,
        variables: parsed.variables,
      },
      suggested_items: suggestedItems,
      historical_references: similarQuotations.slice(0, 3).map((quotation) => ({
        id: quotation.id,
        folio: quotation.folio,
        title: quotation.title,
        client: quotation.client.legalName,
        similarity: quotation.similarity,
      })),
      confidence,
      missing_fields: missingFields,
      needs_review: confidence < 0.8 || missingFields.length > 0,
      rules_applied: this.resolveAppliedRules(input),
    };
  }

  async saveFeedback(input: string, original: Record<string, unknown>, corrected: Record<string, unknown>) {
    const inputText = input.trim();
    if (!inputText) {
      throw new BadRequestException('El texto original es obligatorio.');
    }

    const normalizedCorrected = {
      category: typeof corrected.category === 'string' ? corrected.category : null,
      service: typeof corrected.service === 'string' ? corrected.service : null,
      variables: this.sanitizeVariables(corrected.variables),
      suggested_services: this.sanitizeSuggestedServices(corrected.suggested_services),
      confidence:
        typeof corrected.confidence === 'number' && Number.isFinite(corrected.confidence)
          ? corrected.confidence
          : 0.96,
    };

    await this.aiLearningService.saveFeedback(inputText, original, normalizedCorrected);

    return {
      saved: true,
      ai_status: 'feedback_learned',
      normalized_input: this.aiLearningService.normalizeInput(inputText),
    };
  }

  async createDealFromSuggestion(text: string, clientId: string, actorUserId?: string, customTitle?: string) {
    const suggestion = await this.suggestQuote(text);

    if (!suggestion.suggested_items.length) {
      throw new BadRequestException('No fue posible generar una propuesta útil con ese texto.');
    }

    const validItems = suggestion.suggested_items.filter(
      (item) => item.serviceId && item.pricingProfileId,
    );

    if (!validItems.length) {
      throw new BadRequestException('La IA no encontró conceptos configurados para generar el deal.');
    }

    const quotation = await this.quotationsService.createQuotation(
      {
        clientId,
        title:
          customTitle?.trim() ||
          suggestion.detected.service ||
          suggestion.detected.category ||
          text.trim(),
        coverTitle: customTitle?.trim() || text.trim(),
        executiveSummary: `Sugerencia generada por IA a partir de: ${text.trim()}`,
        serviceType: suggestion.detected.category || 'General',
        templateType: 'AI_ASSISTANT',
        pricingRule: text.toLowerCase().includes('urgente') ? 'URGENT' : 'STANDARD',
        validityDays: 30,
        currency: 'MXN',
        exchangeRate: undefined,
        items: validItems.map((item) => ({
          serviceId: item.serviceId as string,
          pricingProfileId: item.pricingProfileId as string,
          quantity: item.quantity,
        })),
      },
      actorUserId,
    );

    return {
      quotationId: quotation.id,
      folio: quotation.folio,
      title: quotation.title,
      status: quotation.status,
      suggestion,
    };
  }

  private rankServices(
    services: Array<{
      id: string;
      code: string;
      name: string;
      description: string | null;
      relatedWork: string | null;
      category: { id: string; name: string; code: string };
      pricingProfiles: Array<{
        id: string;
        name: string;
        mxnPrice: unknown;
        usdPrice: unknown;
      }>;
    }>,
    parsed: Awaited<ReturnType<AiService['parseQuoteIntent']>>,
    input: string,
    suggestedServiceHints: string[],
  ) {
    const normalizedInput = this.normalize(input);

    return services
      .map((service) => {
        const haystack = this.normalize(
          [service.code, service.name, service.description || '', service.relatedWork || '', service.category.name, service.category.code].join(' '),
        );

        let score = 0;

        if (parsed.category && haystack.includes(this.normalize(parsed.category))) {
          score += 4;
        }

        if (parsed.service && haystack.includes(this.normalize(parsed.service))) {
          score += 5;
        }

        if (
          suggestedServiceHints.some((hint) => haystack.includes(this.normalize(hint)))
        ) {
          score += 4.5;
        }

        for (const keyword of parsed.keywords) {
          if (haystack.includes(this.normalize(keyword))) {
            score += 1.2;
          }
        }

        if (normalizedInput.includes('pruebas completas') && /prueba|config|reporte/.test(haystack)) {
          score += 2;
        }

        return { service, score };
      })
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, 8);
  }

  private buildSuggestedItems(
    rankedServices: Array<{
      service: {
        id: string;
        code: string;
        name: string;
        category: { name: string; code: string };
        pricingProfiles: Array<{
          id: string;
          name: string;
          mxnPrice: unknown;
          usdPrice: unknown;
        }>;
      };
      score: number;
    }>,
    similarQuotations: Array<{
      id: string;
      folio: string;
      title: string;
      similarity: number;
      client: { legalName: string };
      items: Array<{
        serviceCode: string;
        serviceName: string;
        categoryName: string;
        quantity: unknown;
        unitPrice: unknown;
      }>;
    }>,
    parsed: Awaited<ReturnType<AiService['parseQuoteIntent']>>,
    input: string,
    suggestedServiceHints: string[],
  ) {
    const quantity =
      Number(parsed.variables.secciones || parsed.variables.tableros || parsed.variables.equipos || 1) || 1;

    const baseItems = rankedServices.slice(0, 4).map(({ service }) => {
      const pricingProfile = service.pricingProfiles[0];
      const historicalPrices = similarQuotations
        .flatMap((quotation) => quotation.items)
        .filter((item) => this.normalize(item.serviceName) === this.normalize(service.name))
        .map((item) => Number(item.unitPrice));
      const profilePrice = pricingProfile?.mxnPrice ? Number(pricingProfile.mxnPrice) : pricingProfile?.usdPrice ? Number(pricingProfile.usdPrice) : 0;
      const unitPrice = historicalPrices.length
        ? Number((historicalPrices.reduce((sum, value) => sum + value, 0) / historicalPrices.length).toFixed(2))
        : profilePrice;
      const itemQuantity = /seccion|tablero|ccm|switchgear/.test(this.normalize(service.name)) ? quantity : 1;

      return {
        serviceId: service.id,
        pricingProfileId: pricingProfile?.id || null,
        service: service.name,
        model: parsed.category || service.category.code || service.category.name,
        quantity: itemQuantity,
        unit_price: unitPrice,
        total: Number((unitPrice * itemQuantity).toFixed(2)),
      };
    });

    const ruleExtras = this.resolveRuleBasedServices(rankedServices, input, suggestedServiceHints)
      .filter((item, index, current) => current.findIndex((entry) => entry.serviceId === item.serviceId) === index);

    return [...baseItems, ...ruleExtras].slice(0, 6);
  }

  private resolveRuleBasedServices(
    rankedServices: Array<{
      service: {
        id: string;
        name: string;
        category: { code: string; name: string };
        pricingProfiles: Array<{ id: string; mxnPrice: unknown; usdPrice: unknown }>;
      };
      score: number;
    }>,
    input: string,
    suggestedServiceHints: string[],
  ) {
    const normalized = this.normalize(input);
    if (!normalized.includes('pruebas completas') && !suggestedServiceHints.length) {
      return [];
    }

    return rankedServices
      .filter(({ service }) => {
        const haystack = this.normalize(service.name);
        return (
          haystack.includes('config') ||
          haystack.includes('reporte') ||
          haystack.includes('levantamiento') ||
          suggestedServiceHints.some((hint) => haystack.includes(this.normalize(hint)))
        );
      })
      .slice(0, 2)
      .map(({ service }) => {
        const pricingProfile = service.pricingProfiles[0];
        const unitPrice = pricingProfile?.mxnPrice ? Number(pricingProfile.mxnPrice) : pricingProfile?.usdPrice ? Number(pricingProfile.usdPrice) : 0;
        return {
          serviceId: service.id,
          pricingProfileId: pricingProfile?.id || null,
          service: service.name,
          model: service.category.code || service.category.name,
          quantity: 1,
          unit_price: unitPrice,
          total: Number(unitPrice.toFixed(2)),
        };
      });
  }

  private async findSimilarQuotations(
    input: string,
    parsed: Awaited<ReturnType<AiService['parseQuoteIntent']>>,
  ) {
    const quotations = await this.prisma.quotation.findMany({
      where: { deletedAt: null },
      include: {
        client: true,
        items: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });

    return quotations
      .map((quotation) => {
        const haystack = this.normalize(
          [
            quotation.title,
            quotation.notes || '',
            quotation.serviceType || '',
            ...quotation.items.flatMap((item) => [item.serviceCode, item.serviceName, item.categoryName]),
          ].join(' '),
        );

        let score = this.jaccardSimilarity(this.normalize(input), haystack);
        if (parsed.category && haystack.includes(this.normalize(parsed.category))) {
          score += 0.18;
        }
        if (parsed.service && haystack.includes(this.normalize(parsed.service))) {
          score += 0.24;
        }

        return { ...quotation, similarity: Number(score.toFixed(3)) };
      })
      .filter((quotation) => quotation.similarity > 0.12)
      .sort((left, right) => right.similarity - left.similarity)
      .slice(0, 5);
  }

  private resolveAppliedRules(input: string) {
    const normalized = this.normalize(input);
    const rules: string[] = [];

    if (normalized.includes('pruebas completas')) {
      rules.push('Se agregaron conceptos complementarios de configuración y reportes.');
    }

    if (normalized.includes('urgente')) {
      rules.push('Se detectó urgencia para aplicar regla comercial de precio.');
    }

    rules.push('Se intentó resolver primero con reglas aprendidas locales antes de usar IA externa.');

    return rules;
  }

  private resolveMissingFields(
    parsed: Awaited<ReturnType<AiService['parseQuoteIntent']>>,
    suggestedItems: Array<{ service: string }>,
  ) {
    const missing: string[] = [];

    if (!parsed.category) {
      missing.push('category');
    }

    if (!parsed.service) {
      missing.push('service');
    }

    if (!suggestedItems.length) {
      missing.push('suggested_items');
    }

    return missing;
  }

  private sanitizeVariables(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(value).filter(([, current]) => typeof current === 'string' || typeof current === 'number'),
    );
  }

  private sanitizeSuggestedServices(value: unknown) {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  private extractKeywords(value: string) {
    return Array.from(new Set(this.normalize(value).split(/[^a-z0-9]+/).filter((token) => token.length > 2)));
  }

  private buildCatalogSnapshot(
    services: Array<{
      code: string;
      name: string;
      description: string | null;
      category: { name: string; code: string };
    }>,
  ) {
    return services
      .slice(0, 80)
      .map((service) => `${service.category.code}: ${service.name} (${service.code})${service.description ? ` - ${service.description}` : ''}`)
      .join('\n');
  }

  private async loadRecentHistorySnapshot() {
    const quotations = await this.prisma.quotation.findMany({
      where: { deletedAt: null },
      include: {
        client: true,
        items: {
          take: 4,
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 12,
    });

    return quotations
      .map((quotation) => {
        const services = quotation.items.map((item) => item.serviceName).filter(Boolean).join(', ');
        return `${quotation.folio} | ${quotation.client.legalName} | ${quotation.serviceType || 'General'} | ${services}`;
      })
      .join('\n');
  }

  private calculateConfidence(base: number, serviceMatches: number, historicalMatches: number) {
    const score = base + Math.min(serviceMatches, 4) * 0.05 + Math.min(historicalMatches, 3) * 0.04;
    return Number(Math.max(0.35, Math.min(0.97, score)).toFixed(2));
  }

  private normalize(value: string) {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  private jaccardSimilarity(left: string, right: string) {
    const leftSet = new Set(left.split(/[^a-z0-9]+/).filter(Boolean));
    const rightSet = new Set(right.split(/[^a-z0-9]+/).filter(Boolean));
    const intersection = [...leftSet].filter((token) => rightSet.has(token)).length;
    const union = new Set([...leftSet, ...rightSet]).size || 1;
    return intersection / union;
  }
}
