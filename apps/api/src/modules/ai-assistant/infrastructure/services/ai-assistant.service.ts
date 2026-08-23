import { BadRequestException, Injectable } from '@nestjs/common';
import { appendFile, mkdir } from 'fs/promises';
import { dirname, resolve } from 'path';
import { AiLearningService } from '../../../ai-learning/infrastructure/services/ai-learning.service';
import { PrismaService } from '../../../../shared/infrastructure/prisma.service';
import { QuotationsService } from '../../../quotations/infrastructure/services/quotations.service';
import { AiService } from './ai.service';
import type { Quotation } from '@prisma/client';

type AiSuggestionPayload = {
  detected: {
    category: string | null;
    service: string | null;
    variables: Record<string, string | number>;
  };
  suggested_items: Array<{
    serviceId?: string | null;
    pricingProfileId?: string | null;
    pricingProfileName?: string | null;
    quantity: number;
    unitPrice?: number;
    service: string;
  }>;
  suggested_work_items: string[];
  confidence: number;
  suggested_commercial_text?: string;
  learningSources?: Array<{
    source: 'quotation';
    reference: string;
    summary: string;
    similarity: number;
  }>;
};

@Injectable()
export class AiAssistantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
    private readonly aiLearningService: AiLearningService,
    private readonly quotationsService: QuotationsService,
  ) {}

  async suggestQuote(text: string, mode = 'CATALOG_MATCH') {
    const input = text.trim();
    if (!input) {
      throw new BadRequestException('El texto es obligatorio.');
    }

    const services = await this.prisma.supply.findMany({
      where: { deletedAt: null },
      include: {
        category: true,
        pricingProfiles: {
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          include: {
            versions: {
              orderBy: { validFrom: 'desc' },
              take: 1,
            },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
    const servicePriceLookup = this.buildServicePriceLookup(services);

    const historySnapshot = await this.loadRecentHistorySnapshot();
    const learningPromptContext = await this.aiLearningService.getActivePromptContext(mode);
    const localMatch = await this.aiLearningService.findBestRule(input, mode);

    if (mode === 'STRUCTURED_JSON') {
      const structured = await this.aiService.generateStructuredProposal(input, {
        learningPrompts: learningPromptContext,
      });

      return {
        mode,
        engine: structured.engine,
        ai_status: structured.ai_status,
        detected: { category: null, service: null, variables: {} },
        suggested_items: [],
        suggested_work_items: [],
        suggested_commercial_text: '',
        structured_output: structured.proposal,
        historical_references: [],
        confidence: structured.engine === 'openai' ? 0.92 : 0.74,
        catalog_updates: { pending_count: 0, detected_pending: [] },
        missing_fields: [],
        needs_review: false,
        rules_applied: ['Se utilizo el modo de cotizacion estructurada JSON.'],
      };
    }
    const detectedServiceHints = this.extractServiceHintsFromText(input);
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
          learningPrompts: learningPromptContext,
        });

    const similarQuotations = await this.findSimilarQuotations(input, parsed);
    const exactMatchedQuotationSuggestion = this.buildExactMatchedQuotationSuggestion(
      similarQuotations,
      servicePriceLookup,
      parsed.engine === 'local_learning',
    );
    const candidateServices = this.rankServices(
      services,
      parsed,
      input,
      localMatch?.suggestedServices || detectedServiceHints,
    );
    const suggestedItems = await this.buildSuggestedItems(
      candidateServices,
      similarQuotations,
      parsed,
      input,
      localMatch?.suggestedServices || detectedServiceHints,
      servicePriceLookup,
      parsed.engine === 'local_learning',
    );
    const filteredSuggestedItems = this.applyLocalLearningFiltersToItems(
      exactMatchedQuotationSuggestion?.suggestedItems ||
        this.filterSuggestedItemsForRelevance(suggestedItems, input, parsed),
      localMatch?.suggestedServices || [],
      localMatch?.rejectedServices || [],
    );
    const suggestedWorkItems = this.applyLocalLearningFiltersToWorkItems(
      exactMatchedQuotationSuggestion?.suggestedWorkItems ||
        this.buildSuggestedWorkItems(
          candidateServices,
          similarQuotations,
          input,
          detectedServiceHints,
          filteredSuggestedItems.map((item) => item.service),
          parsed.engine === 'local_learning',
        ),
      localMatch?.suggestedWorkItems || [],
      localMatch?.rejectedWorkItems || [],
    );
    const suggestedCommercialText =
      exactMatchedQuotationSuggestion?.suggestedCommercialText ||
      this.buildSuggestedCommercialText(input, similarQuotations);
    const catalogUpdates = await this.syncDetectedCatalogServices(
      services.map((service: { name: string }) => service.name),
      detectedServiceHints.length ? detectedServiceHints : filteredSuggestedItems.map((item) => item.service),
      parsed.category,
      input,
      parsed.confidence,
    );
    const confidence =
      parsed.engine === 'local_learning'
        ? parsed.confidence
        : this.calculateConfidence(parsed.confidence, candidateServices.length, similarQuotations.length);
    const appliedRule =
      parsed.engine === 'local_learning' && localMatch
        ? {
            id: localMatch.matchedRuleId,
            category: localMatch.category,
            service: localMatch.service,
          }
        : null;
    const missingFields = this.resolveMissingFields(parsed, filteredSuggestedItems);

    if (parsed.engine !== 'local_learning') {
      await this.aiLearningService.learnFromSuggestion({
        mode,
        inputText: input,
        category: parsed.category,
        service: parsed.service,
        variables: parsed.variables,
        suggestedServices: filteredSuggestedItems.map((item) => item.service),
        suggestedWorkItems,
        confidence,
      });
    }

    await this.appendSuggestionComparisonLog({
      stage: 'suggestion',
      input,
      mode,
      engine: parsed.engine,
      matchedQuotation: similarQuotations[0]
        ? {
            id: similarQuotations[0].id,
            folio: similarQuotations[0].folio,
            title: similarQuotations[0].title,
            similarity: similarQuotations[0].similarity,
            client: similarQuotations[0].client.legalName,
            items: similarQuotations[0].items.map((item) => ({
              supplyCode: item.supplyCode,
              supplyName: item.supplyName,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              totalPrice: item.totalPrice,
            })),
            workItems: this.extractWorkItemsFromCommercialSections(similarQuotations[0].commercialSections),
            comparison: exactMatchedQuotationSuggestion?.comparison || null,
          }
        : null,
      suggestion: {
        detected: {
          category: parsed.category,
          service: parsed.service,
          variables: parsed.variables,
        },
        suggested_items: filteredSuggestedItems,
        suggested_work_items: suggestedWorkItems,
        suggested_commercial_text: suggestedCommercialText,
        confidence,
      },
    });

    return {
      engine: parsed.engine,
      mode,
      ai_status: parsed.aiStatus,
      detected: {
        category: parsed.category,
        service: parsed.service,
        variables: parsed.variables,
      },
      suggested_items: filteredSuggestedItems,
      suggested_work_items: suggestedWorkItems,
      learningSources: similarQuotations.map((quotation) => ({
        source: 'quotation' as const,
        reference: quotation.folio,
        summary: quotation.executiveSummary || quotation.serviceType || quotation.title,
        similarity: quotation.similarity,
      })),
      suggested_commercial_text: suggestedCommercialText,
      structured_output: null,
      historical_references: similarQuotations.slice(0, 3).map((quotation) => ({
        id: quotation.id,
        folio: quotation.folio,
        title: quotation.title,
        client: quotation.client.legalName,
        similarity: quotation.similarity,
      })),
      confidence,
      catalog_updates: catalogUpdates,
      missing_fields: missingFields,
      needs_review: confidence < 0.8 || missingFields.length > 0,
      rules_applied: this.resolveAppliedRules(input),
      applied_rule: appliedRule,
    };
  }

  async saveFeedback(input: string, original: Record<string, unknown>, corrected: Record<string, unknown>, mode = 'CATALOG_MATCH') {
    const inputText = input.trim();
    if (!inputText) {
      throw new BadRequestException('El texto original es obligatorio.');
    }

    const normalizedCorrected = {
      category: typeof corrected.category === 'string' ? corrected.category : null,
      service: typeof corrected.service === 'string' ? corrected.service : null,
      variables: this.sanitizeVariables(corrected.variables),
      suggested_services: this.sanitizeSuggestedServices(corrected.suggested_services),
      suggested_work_items: this.sanitizeSuggestedWorkItems(corrected.suggested_work_items),
      rejected_services: this.sanitizeSuggestedServices(corrected.rejected_services),
      rejected_work_items: this.sanitizeSuggestedWorkItems(corrected.rejected_work_items),
      confidence:
        typeof corrected.confidence === 'number' && Number.isFinite(corrected.confidence)
          ? corrected.confidence
          : 0.96,
    };

    await this.aiLearningService.saveFeedback(inputText, original, normalizedCorrected, mode);

    return {
      saved: true,
      mode,
      ai_status: 'feedback_learned',
      normalized_input: this.aiLearningService.normalizeInput(inputText),
    };
  }

  async createDealFromSuggestion(
    text: string,
    clientId: string,
    actorUserId?: string,
    customTitle?: string,
    overrideItems?: Array<{
      serviceId: string;
      pricingProfileId: string;
      quantity: number;
      unitPriceOverride?: number;
    }>,
    overrideWorkItems?: string[],
    overrideCommercialText?: string,
    mode = 'CATALOG_MATCH',
  ) {
    if (mode !== 'CATALOG_MATCH') {
      throw new BadRequestException('La creacion automatica de cotizacion solo esta disponible en modo catalogo.');
    }
    const suggestion = await this.suggestQuote(text, mode);

    if (!suggestion.suggested_items.length) {
      throw new BadRequestException('No fue posible generar una propuesta útil con ese texto.');
    }

    const validItems = overrideItems?.length
      ? overrideItems
      : suggestion.suggested_items.filter(
          (item) => item.serviceId && item.pricingProfileId,
        ).map((item) => ({
          serviceId: item.serviceId as string,
          pricingProfileId: item.pricingProfileId as string,
          quantity: item.quantity,
          unitPriceOverride: Number(item.unit_price) > 0 ? Number(item.unit_price) : undefined,
        }));

    if (!validItems.length) {
      throw new BadRequestException('La IA no encontró conceptos configurados para generar el deal.');
    }

    const commercialSections: Array<{ title: string; content: string }> = [];
    const resolvedWorkItems = overrideWorkItems?.length ? overrideWorkItems : suggestion.suggested_work_items;
    const resolvedCommercialText = overrideCommercialText?.trim() || suggestion.suggested_commercial_text?.trim() || '';

    if (resolvedWorkItems.length) {
      commercialSections.push({
        title: 'Trabajos a realizar:',
        content: resolvedWorkItems.join('\n'),
      });
    }

    if (resolvedCommercialText) {
      commercialSections.push({
        title: 'Notas importantes:',
        content: resolvedCommercialText,
      });
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
        executiveSummary: text.trim(),
        serviceType: suggestion.detected.category || 'General',
        templateType: 'AI_ASSISTANT',
        pricingRule: text.toLowerCase().includes('urgente') ? 'URGENT' : 'STANDARD',
        validityDays: 30,
        currency: 'MXN',
        exchangeRate: undefined,
        commercialSections: commercialSections.length ? commercialSections : undefined,
        items: validItems.map((item) => ({
          serviceId: item.serviceId,
          pricingProfileId: item.pricingProfileId,
          quantity: Number(item.quantity) || 1,
          unitPriceOverride:
            typeof item.unitPriceOverride === 'number' && item.unitPriceOverride >= 0
              ? item.unitPriceOverride
              : undefined,
        })),
      },
      actorUserId,
    );

    const trainingItems = validItems.map((item) => ({
      serviceId: item.serviceId,
      pricingProfileId: item.pricingProfileId,
      quantity: Number(item.quantity) || 1,
      unitPriceOverride:
        typeof item.unitPriceOverride === 'number' && item.unitPriceOverride >= 0
          ? item.unitPriceOverride
          : undefined,
    }));

    const trainingSuggestionItems = suggestion.suggested_items.map((item) => ({
      ...item,
      quantity: 'quantity' in item ? Number(item.quantity) || 1 : 1,
    }));

    void this.recordTrainingExample({
      text,
      mode,
      clientId,
      suggestion: {
        detected: suggestion.detected,
        suggested_items: trainingSuggestionItems,
        suggested_work_items: resolvedWorkItems,
        confidence: suggestion.confidence ?? 0,
        suggested_commercial_text: resolvedCommercialText,
      },
      quotation,
      items: trainingItems,
      workItems: resolvedWorkItems,
      commercialSections,
    });

    await this.appendSuggestionComparisonLog({
      stage: 'created_quotation',
      input: text.trim(),
      mode,
      engine: suggestion.engine,
      matchedQuotation: suggestion.historical_references?.[0]
        ? {
            id: suggestion.historical_references[0].id,
            folio: suggestion.historical_references[0].folio,
            title: suggestion.historical_references[0].title,
            similarity: suggestion.historical_references[0].similarity,
            client: suggestion.historical_references[0].client,
          }
        : null,
      suggestion: {
        detected: suggestion.detected,
        suggested_items: trainingSuggestionItems,
        suggested_work_items: resolvedWorkItems,
        suggested_commercial_text: resolvedCommercialText,
        confidence: suggestion.confidence ?? 0,
      },
      createdQuotation: {
        id: quotation.id,
        folio: quotation.folio,
        title: quotation.title,
        status: quotation.status,
        items: trainingItems,
        workItems: resolvedWorkItems,
        commercialSections,
      },
    });

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
        versions?: Array<{ mxnPrice?: unknown; usdPrice?: unknown }>;
      }>;
    }>,
    parsed: Awaited<ReturnType<AiService['parseQuoteIntent']>>,
    input: string,
    suggestedServiceHints: string[],
  ) {
    const normalizedInput = this.normalize(input);
    const searchTerms = this.expandSearchTerms(parsed, input, suggestedServiceHints);
    const isSimpleScope = this.isSimpleScopeRequest(normalizedInput);

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

        const tokenMatches = searchTerms.filter((term) => haystack.includes(term)).length;
        score += tokenMatches * 0.9;

        for (const keyword of parsed.keywords) {
          if (haystack.includes(this.normalize(keyword))) {
            score += 1.2;
          }
        }

        if (normalizedInput.includes('pruebas completas') && /prueba|config|reporte/.test(haystack)) {
          score += 2;
        }

        if (
          (normalizedInput.includes('minigear') || normalizedInput.includes('34.5')) &&
          /minigear|switchgear|swbg|relevador|proteccion|tp|medidor|aislamiento|contacto|arco/.test(haystack)
        ) {
          score += 3;
        }

        if (
          normalizedInput.includes('puesta en marcha') &&
          /puesta|energizado|carga|vacio|operacion|inyeccion|disparo/.test(haystack)
        ) {
          score += 2.6;
        }

        if (isSimpleScope && this.isAdvancedHighComplexityService(haystack)) {
          score -= 6;
        }

        if (parsed.service && !this.serviceSeemsCompatibleWithIntent(parsed.service, haystack, normalizedInput)) {
          score -= 3.5;
        }

        if (this.containsMismatchedDomainTerms(normalizedInput, haystack)) {
          score -= 2.8;
        }

        return { service, score };
      })
      .filter((entry) => entry.score > 1.8)
      .sort((left, right) => right.score - left.score)
      .slice(0, 8);
  }

  private async buildSuggestedItems(
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
      commercialSections: unknown;
      items: Array<{
        supplyCode: string;
        supplyName: string;
        categoryName: string;
        quantity: unknown;
        unitPrice: unknown;
      }>;
    }>,
    parsed: Awaited<ReturnType<AiService['parseQuoteIntent']>>,
    input: string,
    suggestedServiceHints: string[],
    servicePriceLookup: Map<string, { serviceId: string; pricingProfileId?: string; price: number }>,
    preferExactHistoricalMatch = false,
  ) {
    const quantity =
      Number(parsed.variables.secciones || parsed.variables.tableros || parsed.variables.equipos || 1) || 1;

    const baseItems = rankedServices.slice(0, 4).map(({ service }) => {
      const pricingProfile = service.pricingProfiles[0];
      const historicalPrices = similarQuotations
        .flatMap((quotation) => quotation.items)
        .filter((item) => this.normalize(item.supplyName) === this.normalize(service.name))
        .map((item) => Number(item.unitPrice));
      const profilePrice = this.resolveProfileUnitPrice(pricingProfile);
      const unitPrice = historicalPrices.length
        ? Number((historicalPrices.reduce((sum, value) => sum + value, 0) / historicalPrices.length).toFixed(2))
        : profilePrice;
      const exactHistoricalQuantity = preferExactHistoricalMatch
        ? this.findExactHistoricalQuantity(similarQuotations, service.name)
        : null;
      const itemQuantity =
        exactHistoricalQuantity ||
        (/seccion|tablero|ccm|switchgear/.test(this.normalize(service.name)) ? quantity : 1);

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

    const historyExtras = await this.buildHistoricalSuggestions(
      similarQuotations.map((quotation) => ({
        items: quotation.items.map((item) => ({
          supplyName: item.supplyName,
          categoryName: item.categoryName,
          quantity:
            typeof item.quantity === 'number'
              ? item.quantity
              : typeof item.quantity === 'string'
                ? Number(item.quantity.replace(/[^0-9.]/g, '')) || null
                : null,
          unitPrice:
            typeof item.unitPrice === 'number'
              ? item.unitPrice
              : typeof item.unitPrice === 'string'
                ? Number(item.unitPrice.replace(/[^0-9.]/g, '')) || null
                : null,
        })),
      })),
      parsed,
      servicePriceLookup,
      preferExactHistoricalMatch,
    );

    return this.filterBillableSuggestedItems(
      this.dedupeSuggestedItems([...baseItems, ...ruleExtras, ...historyExtras]).slice(0, 8),
    );
  }

  private buildSuggestedWorkItems(
    rankedServices: Array<{
      service: {
        relatedWork: string | null;
      };
    }>,
    similarQuotations: Array<{
      commercialSections: unknown;
    }>,
    input: string,
    detectedServiceHints: string[],
    suggestedServiceNames: string[],
    preferExactHistoricalMatch = false,
  ) {
    const fromRelatedWork = rankedServices
      .slice(0, 6)
      .flatMap(({ service }) => this.splitWorkItems(service.relatedWork || ''));

    const fromHistory = similarQuotations
      .slice(0, preferExactHistoricalMatch ? 1 : 3)
      .flatMap((quotation) => this.extractWorkItemsFromCommercialSections(quotation.commercialSections));

    const fromInput = preferExactHistoricalMatch ? [] : this.extractActivityLinesFromText(input);

    const fallbackHints = (preferExactHistoricalMatch ? [] : detectedServiceHints).filter(
      (hint) =>
        !suggestedServiceNames.some((serviceName) => this.normalize(serviceName) === this.normalize(hint)),
    );

    return this.orderWorkItemsWithReportLast(
      Array.from(
        new Set(
          [...fromRelatedWork, ...fromHistory, ...fromInput, ...fallbackHints]
            .map((item) => item.trim())
            .filter((item) => item.length > 4),
        ),
      ),
    )
      .filter((item) => !this.isCommercialText(item))
      .slice(0, 20);
  }

  private resolveRuleBasedServices(
    rankedServices: Array<{
      service: {
        id: string;
        name: string;
        category: { code: string; name: string };
      pricingProfiles: Array<{
        id: string;
        mxnPrice: unknown;
        usdPrice: unknown;
        versions?: Array<{ mxnPrice?: unknown; usdPrice?: unknown }>;
      }>;
      };
      score: number;
    }>,
    input: string,
    suggestedServiceHints: string[],
  ) {
    const normalized = this.normalize(input);
    if (
      !normalized.includes('pruebas completas') &&
      !normalized.includes('puesta en marcha') &&
      !normalized.includes('minigear') &&
      !suggestedServiceHints.length
    ) {
      return [];
    }

    return rankedServices
      .filter(({ service }) => {
        const haystack = this.normalize(service.name);
        return (
          haystack.includes('config') ||
          haystack.includes('reporte') ||
          haystack.includes('levantamiento') ||
          haystack.includes('relevador') ||
          haystack.includes('proteccion') ||
          haystack.includes('medidor') ||
          haystack.includes('tp') ||
          haystack.includes('aislamiento') ||
          haystack.includes('contacto') ||
          suggestedServiceHints.some((hint) => haystack.includes(this.normalize(hint)))
        );
      })
      .slice(0, 4)
      .map(({ service }) => {
        const pricingProfile = service.pricingProfiles[0];
        const unitPrice = this.resolveProfileUnitPrice(pricingProfile);
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

  private filterSuggestedItemsForRelevance(
    items: Array<{
      service: string;
      serviceId: string | null;
      pricingProfileId: string | null;
      quantity: number;
      unit_price: number;
      total: number;
      model: string;
    }>,
    input: string,
    parsed: Awaited<ReturnType<AiService['parseQuoteIntent']>>,
  ) {
    const normalizedInput = this.normalize(input);
    const isSimpleScope = this.isSimpleScopeRequest(normalizedInput);

    const filtered = items.filter((item) => {
      const haystack = this.normalize(item.service);

      if (isSimpleScope && this.isAdvancedHighComplexityService(haystack)) {
        return false;
      }

      if (parsed.service && !this.serviceSeemsCompatibleWithIntent(parsed.service, haystack, normalizedInput)) {
        return false;
      }

      if (this.containsMismatchedDomainTerms(normalizedInput, haystack)) {
        return false;
      }

      return true;
    });

    return filtered.length ? this.dedupeSuggestedItems(filtered) : this.dedupeSuggestedItems(items);
  }

  private async findSimilarQuotations(
    input: string,
    parsed: Awaited<ReturnType<AiService['parseQuoteIntent']>>,
  ) {
    const normalizedInput = this.normalize(input);
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
            ...this.extractWorkItemsFromCommercialSections(quotation.commercialSections),
            ...quotation.items.flatMap((item) => [item.supplyCode, item.supplyName, item.categoryName]),
          ]
            .filter(Boolean)
            .join(' '),
        );

        let score = this.jaccardSimilarity(normalizedInput, haystack);
        if (parsed.category && haystack.includes(this.normalize(parsed.category))) {
          score += 0.18;
        }
        if (parsed.service && haystack.includes(this.normalize(parsed.service))) {
          score += 0.24;
        }

        const concepts = this.extractQuotationConcepts(quotation);
        if (concepts.some((concept) => normalizedInput.includes(concept))) {
          score += 0.18;
        }

        return {
          ...quotation,
          similarity: Number(score.toFixed(3)),
          concepts,
        };
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

    if (normalized.includes('minigear') || normalized.includes('34.5')) {
      rules.push('Se reforzó la búsqueda de actividades y suministros asociados a Minigear/SWBG de media tensión.');
    }

    rules.push('Se intentó resolver primero con reglas aprendidas locales antes de usar IA externa.');

    return rules;
  }

  private buildExactMatchedQuotationSuggestion(
    similarQuotations: Array<{
      similarity: number;
      commercialSections: unknown;
      items: Array<{
        supplyId?: string | null;
        pricingProfileId?: string | null;
        supplyCode?: string | null;
        supplyName?: string | null;
        categoryName?: string | null;
        quantity?: unknown;
        unitPrice?: unknown;
        totalPrice?: unknown;
      }>;
    }>,
    servicePriceLookup: Map<string, { serviceId: string; pricingProfileId?: string; price: number }>,
    preferExactMatch: boolean,
  ) {
    const [quotation] = similarQuotations;
    if (!quotation) {
      return null;
    }

    if (!preferExactMatch && quotation.similarity < 0.55) {
      return null;
    }

    const matchedBillableItems = quotation.items
      .filter((item) => Boolean(item.supplyName))
      .filter((item) => !this.isDerivedSpecialConsiderationCode(item.supplyCode))
      .map((item) => {
        const quantity = Math.max(1, Number(item.quantity || 1));
        const unitPrice = Number(item.unitPrice || 0);
        const total = Number(item.totalPrice || unitPrice * quantity || 0);

        return {
          source: item,
          quantity,
          unitPrice,
          total: Number(total.toFixed(2)),
        };
      })
      .filter((item) => item.unitPrice > 0 && item.total > 0);

    const suggestedItems = matchedBillableItems.map(({ source, quantity, unitPrice, total }) => {
      const serviceName = String(source.supplyName || '').trim();
      const fallbackCatalogMatch = servicePriceLookup.get(this.normalize(serviceName));

      return {
        serviceId: source.supplyId || fallbackCatalogMatch?.serviceId || null,
        pricingProfileId: source.pricingProfileId || fallbackCatalogMatch?.pricingProfileId || null,
        service: serviceName,
        model: source.categoryName || null,
        quantity,
        unit_price: unitPrice,
        total,
      };
    });

    const matchedItemCount = matchedBillableItems.length;
    const matchedTotal = Number(
      matchedBillableItems.reduce((sum, item) => sum + item.total, 0).toFixed(2),
    );
    const suggestedItemCount = suggestedItems.length;
    const suggestedTotal = Number(
      suggestedItems.reduce((sum, item) => sum + item.total, 0).toFixed(2),
    );

    return {
      suggestedItems,
      suggestedWorkItems: [],
      suggestedCommercialText: '',
      comparison: {
        matchedItemCount,
        suggestedItemCount,
        matchedTotal,
        suggestedTotal,
      },
    };
  }

  private isDerivedSpecialConsiderationCode(code?: string | null) {
    return ['ADICIONAL', 'VIATICOS'].includes(String(code || '').trim().toUpperCase());
  }

  private extractQuotationConcepts(quotation: {
    title: string;
    executiveSummary: string | null;
    serviceType: string | null;
    commercialSections: unknown;
    items: Array<{ supplyName: string | null }>;
  }) {
    const text = [
      quotation.title,
      quotation.executiveSummary || '',
      quotation.serviceType || '',
      ...this.extractWorkItemsFromCommercialSections(quotation.commercialSections),
      ...quotation.items.map((item) => item.supplyName || ''),
    ]
      .join(' ')
      .replace(/[^a-z0-9]+/gi, ' ')
      .toLowerCase()
      .trim();
    const tokens = new Set<string>();
    text.split(/\s+/).forEach((token) => {
      if (token.length > 3) {
        tokens.add(token);
      }
    });
    return Array.from(tokens);
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

  private applyLocalLearningFiltersToItems(
    items: Array<{ service: string } & Record<string, unknown>>,
    acceptedServices: string[],
    rejectedServices: string[],
  ) {
    const accepted = new Set(acceptedServices.map((item) => this.normalize(item)));
    const rejected = new Set(rejectedServices.map((item) => this.normalize(item)));

    return items.filter((item) => {
      const normalized = this.normalize(item.service);
      if (rejected.has(normalized)) {
        return false;
      }
      return !accepted.size || accepted.has(normalized) || !acceptedServices.length;
    });
  }

  private applyLocalLearningFiltersToWorkItems(
    items: string[],
    acceptedWorkItems: string[],
    rejectedWorkItems: string[],
  ) {
    const accepted = new Set(acceptedWorkItems.map((item) => this.normalize(item)));
    const rejected = new Set(rejectedWorkItems.map((item) => this.normalize(item)));

    const filtered = items.filter((item) => {
      const normalized = this.normalize(item);
      if (rejected.has(normalized)) {
        return false;
      }
      return !accepted.size || accepted.has(normalized) || !acceptedWorkItems.length;
    });

    return filtered.length || !acceptedWorkItems.length ? filtered : acceptedWorkItems;
  }

  private sanitizeVariables(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(value).filter(([, current]) => typeof current === 'string' || typeof current === 'number'),
    );
  }

  private buildHistoricalSuggestions(
    similarQuotations: Array<{
      items: Array<{
        supplyName: string;
        categoryName: string;
        quantity: number | null;
        unitPrice: number | null;
      }>;
    }>,
    parsed: Awaited<ReturnType<AiService['parseQuoteIntent']>>,
    servicePriceLookup: Map<string, { serviceId: string; pricingProfileId?: string; price: number }>,
    preferExactHistoricalMatch = false,
  ) {
    if (preferExactHistoricalMatch && similarQuotations.length) {
      const exactItems = similarQuotations[0].items
        .filter((item) => Boolean(item.supplyName))
        .map((item) => {
          const serviceName = item.supplyName.trim();
          const catalogMatch = servicePriceLookup.get(this.normalize(serviceName));
          const quantity = Math.max(1, Number(item.quantity || 1));
          const unitPrice = catalogMatch?.price ?? Number(item.unitPrice || 0);

          return {
            serviceId: catalogMatch?.serviceId || null,
            pricingProfileId: catalogMatch?.pricingProfileId || null,
            service: serviceName,
            model: parsed.category || item.categoryName || 'Servicio',
            quantity,
            unit_price: unitPrice,
            total: Number((unitPrice * quantity).toFixed(2)),
          };
        });

      return this.filterBillableSuggestedItems(this.dedupeSuggestedItems(exactItems)).slice(0, 8);
    }

    const summaries = similarQuotations
      .flatMap((quotation) => quotation.items)
      .filter((item) => Boolean(item.supplyName))
      .map((item) => ({
        name: item.supplyName ? item.supplyName.trim() : '',
        category: item.categoryName || '',
        price: Number(item.unitPrice || 0),
        quantity: Number(item.quantity || 1),
      }));

    const grouped = new Map<
      string,
      { name: string; category: string; priceSum: number; count: number; quantitySum: number }
    >();

    summaries.forEach((entry) => {
      const key = this.normalize(entry.name);
      const existing = grouped.get(key);
      if (existing) {
        existing.priceSum += entry.price;
        existing.quantitySum += entry.quantity;
        existing.count += 1;
      } else {
        grouped.set(key, {
          name: entry.name,
          category: entry.category,
          priceSum: entry.price,
          count: 1,
          quantitySum: entry.quantity,
        });
      }
    });

    const entries = Array.from(grouped.values())
      .map((entry) => {
        const avgPrice = entry.count ? Number((entry.priceSum / entry.count).toFixed(2)) : 0;
        const qty =
          /seccion|tablero|ccm|switchgear/.test(this.normalize(entry.name))
            ? Number(parsed.variables.secciones || 1)
            : Math.max(1, Number(entry.quantitySum || 1));
        const serviceName = entry.name || parsed.service || 'Servicio histórico';
        const normalizedName = this.normalize(serviceName);
        const catalogMatch = servicePriceLookup.get(normalizedName);
        const unitPrice =
          catalogMatch?.price || (entry.count ? Number((entry.priceSum / entry.count).toFixed(2)) : 0);
        return {
          serviceId: catalogMatch?.serviceId || null,
          pricingProfileId: catalogMatch?.pricingProfileId || null,
          service: serviceName,
          model: parsed.category || entry.category,
          quantity: qty,
          unit_price: unitPrice,
          total: Number((unitPrice * qty).toFixed(2)),
        };
      })
      .slice(0, 4);

    if (!entries.length && similarQuotations.length) {
      const fallbackItem = similarQuotations[0].items[0];
      const serviceName = fallbackItem?.supplyName || 'Servicio histórico';
      const normalizedName = this.normalize(serviceName);
      const catalogMatch = servicePriceLookup.get(normalizedName);
      const unitPrice = catalogMatch?.price ?? Number(fallbackItem?.unitPrice ?? 0);
      return [
        {
          serviceId: catalogMatch?.serviceId || null,
          pricingProfileId: catalogMatch?.pricingProfileId || null,
          service: serviceName,
          model: parsed.category || fallbackItem?.categoryName || 'Servicio',
          quantity: Number(parsed.variables.secciones || 1),
          unit_price: unitPrice,
          total: Number((unitPrice || 0) * Number(parsed.variables.secciones || 1)),
        },
      ];
    }

    return entries;
  }

  private findExactHistoricalQuantity(
    similarQuotations: Array<{
      items: Array<{
        supplyName: string;
        quantity: unknown;
      }>;
    }>,
    serviceName: string,
  ) {
    const target = this.normalize(serviceName);
    const matchingItem = similarQuotations[0]?.items.find(
      (item) => this.normalize(item.supplyName || '') === target,
    );

    if (!matchingItem) {
      return null;
    }

    return Math.max(1, Number(matchingItem.quantity || 1));
  }

  private filterBillableSuggestedItems<
    T extends {
      serviceId: string | null;
      pricingProfileId: string | null;
      unit_price: number;
      total: number;
      quantity: number;
    },
  >(items: T[]) {
    return items.filter(
      (item) =>
        Boolean(item.serviceId) &&
        Boolean(item.pricingProfileId) &&
        Number.isFinite(item.unit_price) &&
        item.unit_price > 0 &&
        Number.isFinite(item.total) &&
        item.total > 0 &&
        Number.isFinite(item.quantity) &&
        item.quantity > 0,
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

  private sanitizeSuggestedWorkItems(value: unknown) {
    if (!Array.isArray(value)) {
      return [];
    }

    return Array.from(
      new Set(
        value
          .filter((entry): entry is string => typeof entry === 'string')
          .flatMap((entry) => this.splitStructuredActivities(entry))
          .map((entry) => entry.trim())
          .filter(Boolean),
      ),
    );
  }

  private extractKeywords(value: string) {
    return Array.from(new Set(this.normalize(value).split(/[^a-z0-9]+/).filter((token) => token.length > 2)));
  }

  private splitWorkItems(content: string) {
    return this.splitStructuredActivities(content);
  }

  private buildSuggestedCommercialText(
    input: string,
    similarQuotations: Array<{
      commercialSections: unknown;
    }>,
  ) {
    const fromInput = this.extractCommercialTextFromText(input);
    if (fromInput.length) {
      return fromInput.join('\n');
    }

    const fromHistory = similarQuotations
      .slice(0, 2)
      .flatMap((quotation) => this.extractCommercialNotesFromSections(quotation.commercialSections));

    return Array.from(new Set(fromHistory.map((item) => item.trim()).filter(Boolean))).join('\n');
  }

  private extractWorkItemsFromCommercialSections(value: unknown) {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.flatMap((section) => {
      if (!section || typeof section !== 'object') {
        return [];
      }

      const title = 'title' in section && typeof section.title === 'string' ? section.title : '';
      const content = 'content' in section && typeof section.content === 'string' ? section.content : '';
      if (!content || (!/trabajos a realizar|actividades|alcance/i.test(title) && content.length < 20)) {
        return [];
      }

      return this.splitStructuredActivities(content);
    });
  }

  private extractCommercialNotesFromSections(value: unknown) {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.flatMap((section) => {
      if (!section || typeof section !== 'object') {
        return [];
      }

      const title = 'title' in section && typeof section.title === 'string' ? section.title : '';
      const content = 'content' in section && typeof section.content === 'string' ? section.content : '';
      if (!content || /trabajos a realizar|actividades/i.test(title)) {
        return [];
      }

      return this.extractCommercialTextFromText(content);
    });
  }

  private orderWorkItemsWithReportLast(values: string[]) {
    const reportItems = values.filter((value) => this.normalize(value).includes('entrega de reporte'));
    const regularItems = values.filter((value) => !this.normalize(value).includes('entrega de reporte'));
    return [...regularItems, ...reportItems];
  }

  private extractServiceHintsFromText(value: string) {
    const lines = value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const pivotIndex = lines.findIndex((line) =>
      /se realizo lo siguiente|se realiz[oó] lo siguiente|alcance|incluye|trabajos/i.test(line),
    );

    const sourceLines = pivotIndex >= 0 ? lines.slice(pivotIndex + 1) : lines.filter((line) => line.length > 18);
    const expanded = sourceLines.flatMap((line) => this.splitStructuredActivities(line));

    return Array.from(
      new Set(
        expanded.filter((entry) => !/servicio a |se realizo|se realiz[oó]|tablero|minigear|secciones/i.test(entry)),
      ),
    ).slice(0, 20);
  }

  private extractActivityLinesFromText(value: string) {
    const lines = value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length <= 1 && value.length > 80) {
      return this.splitStructuredActivities(value);
    }

    return lines.flatMap((line) => this.splitStructuredActivities(line));
  }

  private extractCommercialTextFromText(value: string) {
    return this.splitStructuredActivities(value).filter((entry) => this.isCommercialText(entry));
  }

  private splitStructuredActivities(value: string) {
    const normalizedLine = value.replace(/\s+/g, ' ').trim();
    if (!normalizedLine) {
      return [];
    }

    const prepared = normalizedLine
      .replace(/\b(se realizo lo siguiente|se realiz[oó] lo siguiente|alcance|incluye|trabajos a realizar)\b[:\-]?\s*/gi, '')
      .replace(
        /,\s+(?=(Revision|Revisión|Limpieza|Reapriete|Prueba|Pruebas|Configuracion|Configuración|Entrega|Energizado|Levantamiento|Verificacion|Verificación|Operacion|Operación)\b)/g,
        '\n',
      )
      .replace(
        /\s+(?=(Revision|Revisión|Limpieza|Reapriete|Prueba|Pruebas|Configuracion|Configuración|Entrega|Energizado|Levantamiento|Verificacion|Verificación|Operacion|Operación)\b)/g,
        '\n',
      );

    return prepared
      .split(/\r?\n|•|;|(?<=\.)\s+(?=[A-ZÁÉÍÓÚÑ])/)
      .map((chunk) => chunk.trim().replace(/^[\-\u2022]+/, '').trim())
      .filter((chunk) => chunk.length > 8)
      .filter((chunk) => !/^para este servicio/i.test(chunk));
  }

  private isCommercialText(value: string) {
    const normalized = this.normalize(value);
    return (
      normalized.includes('una vez autorizado este presupuesto') ||
      normalized.includes('tiempo estimado') ||
      normalized.includes('dias en sitio') ||
      normalized.includes('facilidades de las instalaciones') ||
      normalized.includes('validez de 30 dias') ||
      normalized.includes('condiciones de pago') ||
      normalized.includes('100 %') ||
      normalized.includes('100%') ||
      normalized.includes('despues de concluir el servicio') ||
      normalized.includes('grupo de personal considerado') ||
      normalized.includes('reportes de campo') ||
      normalized.includes('notas importantes') ||
      normalized.includes('precios y validez')
    );
  }

  private expandSearchTerms(
    parsed: Awaited<ReturnType<AiService['parseQuoteIntent']>>,
    input: string,
    suggestedServiceHints: string[],
  ) {
    const normalizedInput = this.normalize(input);
    const terms = new Set<string>([
      ...this.extractKeywords(input),
      ...parsed.keywords.map((keyword) => this.normalize(keyword)),
      ...suggestedServiceHints.flatMap((hint) => this.extractKeywords(hint)),
    ]);

    if (parsed.category) {
      terms.add(this.normalize(parsed.category));
    }

    if (parsed.service) {
      this.extractKeywords(parsed.service).forEach((term) => terms.add(term));
    }

    if (normalizedInput.includes('pruebas completas')) {
      ['prueba', 'pruebas', 'configuracion', 'reporte', 'reportes'].forEach((term) => terms.add(term));
    }

    if (normalizedInput.includes('tablero')) {
      ['tablero', 'tableros', 'seccion', 'secciones'].forEach((term) => terms.add(term));
    }

    if (normalizedInput.includes('ccm')) {
      ['ccm', 'motor', 'motores'].forEach((term) => terms.add(term));
    }

    if (normalizedInput.includes('minigear') || normalizedInput.includes('34.5')) {
      [
        'minigear',
        'swbg',
        'switchgear',
        'media',
        'tension',
        'relevador',
        'proteccion',
        'aislamiento',
        'contacto',
        'medidor',
        'arco',
        'inyeccion',
        'energizado',
        'vacio',
        'carga',
      ].forEach((term) => terms.add(term));
    }

    if (normalizedInput.includes('puesta en marcha')) {
      ['puesta', 'marcha', 'operacion', 'disparo', 'prueba', 'pruebas'].forEach((term) => terms.add(term));
    }

    return [...terms].filter((term) => term.length > 2);
  }

  private dedupeSuggestedItems<
    T extends {
      service: string;
      serviceId: string | null;
      pricingProfileId: string | null;
    },
  >(items: T[]) {
    const selected: T[] = [];
    const seenIds = new Set<string>();
    const seenFamilies = new Set<string>();

    for (const item of items) {
      const idKey = item.serviceId || item.pricingProfileId || this.normalize(item.service);
      const familyKey = this.buildServiceFamilyKey(item.service);

      if (seenIds.has(idKey) || seenFamilies.has(familyKey)) {
        continue;
      }

      seenIds.add(idKey);
      seenFamilies.add(familyKey);
      selected.push(item);
    }

    return selected;
  }

  private buildServiceFamilyKey(value: string) {
    const normalized = this.normalize(value)
      .replace(/\b(servicio|suministro|pruebas?|prueba|de|del|para|con|y|tablero|electrico|electrica|electricos|electrica|sistema)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return normalized || this.normalize(value);
  }

  private isSimpleScopeRequest(normalizedInput: string) {
    return (
      /\b(cambiar|cambio|reemplazo|reemplazar|sustitucion|sustituir|instalar|instalacion|poner)\b/.test(normalizedInput) &&
      /\b(foco|focos|lampara|lamparas|luminaria|luminarias|contacto|contactos|apagador|apagadores|breaker|breakers|interruptor|interruptores)\b/.test(normalizedInput)
    );
  }

  private isAdvancedHighComplexityService(haystack: string) {
    return /\b(arco|sel751a|relevador|proteccion|tp|transformacion|inyeccion|subestacion|switchgear|swbg|minigear|media tension|disparo)\b/.test(
      haystack,
    );
  }

  private serviceSeemsCompatibleWithIntent(parsedService: string, haystack: string, normalizedInput: string) {
    const normalizedService = this.normalize(parsedService);

    if (/\b(mantenimiento|revision|limpieza)\b/.test(normalizedService)) {
      return /\b(mantenimiento|revision|limpieza|inspeccion|apriete)\b/.test(haystack);
    }

    if (/\b(cambio|reemplazo|sustitucion)\b/.test(normalizedInput)) {
      return /\b(cambio|reemplazo|sustitucion|instalacion)\b/.test(haystack);
    }

    if (normalizedService.includes('puesta en marcha')) {
      return /\b(puesta|energizado|operacion|prueba|disparo|carga|vacio)\b/.test(haystack);
    }

    if (normalizedService.includes('pruebas')) {
      return /\b(prueba|pruebas|aislamiento|continuidad|operacion|contacto)\b/.test(haystack);
    }

    return true;
  }

  private containsMismatchedDomainTerms(normalizedInput: string, haystack: string) {
    if (/\b(foco|focos|lampara|lamparas|luminaria|luminarias)\b/.test(normalizedInput)) {
      return /\b(arco|relevador|tp|sel751a|subestacion|switchgear|swbg|minigear)\b/.test(haystack);
    }

    if (/\b(contacto|contactos|apagador|apagadores)\b/.test(normalizedInput)) {
      return /\b(arco|tp|sel751a|switchgear|subestacion|minigear)\b/.test(haystack);
    }

    return false;
  }

  private async syncDetectedCatalogServices(
    existingServices: string[],
    detectedServices: string[],
    category: string | null,
    input: string,
    confidence: number,
  ) {
    const existingNormalized = new Set(existingServices.map((service) => this.normalize(service)));
    const missing = Array.from(
      new Set(
        detectedServices
          .map((service) => service.trim())
          .filter((service) => service.length > 4)
          .filter((service) => !existingNormalized.has(this.normalize(service))),
      ),
    );

    if (!missing.length) {
      return {
        pending_count: 0,
        detected_pending: [],
      };
    }

    const upserted: string[] = [];

    for (const serviceName of missing) {
      const normalizedName = this.normalize(serviceName);

      try {
        const record = await this.prisma.detectedCatalogService.upsert({
          where: { normalizedName },
          update: {
            name: serviceName,
            suggestedCategory: category,
            sourceInput: input,
            confidence,
            usageCount: { increment: 1 },
            status: 'PENDING',
          },
          create: {
            name: serviceName,
            normalizedName,
            suggestedCategory: category,
            sourceInput: input,
            confidence,
            usageCount: 1,
            status: 'PENDING',
          },
        });

        upserted.push(record.name);
      } catch (error) {
        if (!this.isMissingDetectedCatalogServiceTable(error)) {
          throw error;
        }
      }
    }

    return {
      pending_count: upserted.length,
      detected_pending: upserted,
    };
  }

  private isMissingDetectedCatalogServiceTable(error: unknown) {
    return (
      error instanceof Error &&
      'code' in error &&
      (error as { code?: string }).code === 'P2021' &&
      typeof error.message === 'string' &&
      error.message.includes('DetectedCatalogService')
    );
  }

  private async recordTrainingExample(params: {
    text: string;
    mode: string;
    clientId: string;
    suggestion: AiSuggestionPayload;
    quotation: Quotation;
    items: Array<{ serviceId?: string; pricingProfileId?: string; quantity: number }>;
    workItems: string[];
    commercialSections: Array<{ title: string; content: string }>;
  }) {
    try {
      await this.aiLearningService.createTrainingExample({
        input: {
          text: params.text,
          clientId: params.clientId,
          category: params.suggestion.detected.category,
          service: params.suggestion.detected.service,
          mode: params.mode,
          confidence: params.suggestion.confidence,
        },
        output: {
          detected: params.suggestion.detected,
          suggestedItems: params.suggestion.suggested_items,
          matchedItems: params.items,
          suggestedWorkItems: params.workItems,
          commercialSections: params.commercialSections,
          suggestedCommercialText: params.suggestion.suggested_commercial_text,
          quotation: {
            id: params.quotation.id,
            folio: params.quotation.folio,
            status: params.quotation.status,
            currency: params.quotation.currency,
          },
        },
        aceptado: true,
      });
    } catch (error) {
      console.warn('Failed to save AI training example', error);
    }
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
        const services = quotation.items.map((item) => item.supplyName).filter(Boolean).join(', ');
        return `${quotation.folio} | ${quotation.client.legalName} | ${quotation.serviceType || 'General'} | ${services}`;
      })
      .join('\n');
  }

  private calculateConfidence(base: number, serviceMatches: number, historicalMatches: number) {
    const score = base + Math.min(serviceMatches, 4) * 0.05 + Math.min(historicalMatches, 3) * 0.04;
    return Number(Math.max(0.35, Math.min(0.97, score)).toFixed(2));
  }

  private resolveProfileUnitPrice(profile?: {
    mxnPrice?: unknown;
    usdPrice?: unknown;
    versions?: Array<{ mxnPrice?: unknown; usdPrice?: unknown }>;
  }) {
    if (!profile) {
      return 0;
    }

    const [version] = profile.versions || [];
    const resolvedPrice =
      this.extractDecimal(version?.mxnPrice) ??
      this.extractDecimal(version?.usdPrice) ??
      this.extractDecimal(profile.mxnPrice) ??
      this.extractDecimal(profile.usdPrice);

    return resolvedPrice || 0;
  }

  private buildServicePriceLookup(
    services: Array<{
      id: string;
      name: string;
      pricingProfiles: Array<{
        id: string;
        mxnPrice: unknown;
        usdPrice: unknown;
        versions?: Array<{ mxnPrice?: unknown; usdPrice?: unknown }>;
      }>;
    }>,
  ) {
    const lookup = new Map<string, { serviceId: string; pricingProfileId?: string; price: number }>();

    for (const service of services) {
      const profile = service.pricingProfiles[0];
      if (!profile) {
        continue;
      }

      const price = this.resolveProfileUnitPrice(profile);
      if (!price) {
        continue;
      }

      const normalized = this.normalize(service.name);
      if (lookup.has(normalized)) {
        continue;
      }

      lookup.set(normalized, {
        serviceId: service.id,
        pricingProfileId: profile.id,
        price,
      });
    }

    return lookup;
  }

  private extractDecimal(value: unknown) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string') {
      const parsed = Number(value.replace(/[^0-9.-]/g, ''));
      return Number.isFinite(parsed) ? parsed : null;
    }

    if (value && typeof value === 'object' && 'toNumber' in value && typeof (value as { toNumber: () => number }).toNumber === 'function') {
      const result = (value as { toNumber: () => number }).toNumber();
      return Number.isFinite(result) ? result : null;
    }

    return null;
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

  private async appendSuggestionComparisonLog(entry: {
    stage: 'suggestion' | 'created_quotation';
    input: string;
    mode: string;
    engine: string;
    matchedQuotation: Record<string, unknown> | null;
    suggestion: {
      detected: {
        category: string | null;
        service: string | null;
        variables: Record<string, string | number>;
      };
      suggested_items: unknown[];
      suggested_work_items: string[];
      suggested_commercial_text: string;
      confidence: number;
    };
    createdQuotation?: Record<string, unknown>;
  }) {
    try {
      const filePath = resolve(process.cwd(), 'apps/api/storage/ai-learning/ai-suggestion-comparison-log.jsonl');
      await mkdir(dirname(filePath), { recursive: true });
      await appendFile(
        filePath,
        `${JSON.stringify({
          loggedAt: new Date().toISOString(),
          ...entry,
        })}\n`,
        'utf8',
      );
    } catch (error) {
      console.error('appendSuggestionComparisonLog failed:', error);
    }
  }
}
