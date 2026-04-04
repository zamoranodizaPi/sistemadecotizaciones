import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/infrastructure/prisma.service';

type LearnedSuggestion = {
  category: string | null;
  service: string | null;
  variables: Record<string, string | number>;
  suggestedServices: string[];
  confidence: number;
  matchedRuleId: string;
  usageCount: number;
};

type FeedbackPayload = {
  category: string | null;
  service: string | null;
  variables: Record<string, string | number>;
  suggested_services: string[];
  confidence?: number;
};

@Injectable()
export class AiLearningService {
  constructor(private readonly prisma: PrismaService) {}

  normalizeInput(text: string) {
    return text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  async findBestRule(inputText: string): Promise<LearnedSuggestion | null> {
    const normalizedInput = this.normalizeInput(inputText);
    const keywords = this.extractKeywords(normalizedInput).slice(0, 6);

    let candidates: Awaited<ReturnType<typeof this.prisma.learnedRule.findMany>> = [];
    let fallbackCandidates: Awaited<ReturnType<typeof this.prisma.learnedRule.findMany>> = [];

    try {
      candidates = await this.prisma.learnedRule.findMany({
        where: keywords.length
          ? {
              OR: keywords.map((keyword) => ({
                normalizedInput: { contains: keyword },
              })),
            }
          : undefined,
        orderBy: [{ usageCount: 'desc' }, { updatedAt: 'desc' }],
        take: 40,
      });

      fallbackCandidates = !candidates.length
        ? await this.prisma.learnedRule.findMany({
            orderBy: [{ usageCount: 'desc' }, { updatedAt: 'desc' }],
            take: 25,
          })
        : [];
    } catch (error) {
      if (this.isMissingLearnedRuleTable(error)) {
        return null;
      }

      throw error;
    }

    const pool = candidates.length ? candidates : fallbackCandidates;
    if (!pool.length) {
      return null;
    }

    const best = pool
      .map((rule) => ({
        rule,
        score: this.scoreRule(normalizedInput, rule.normalizedInput, rule.usageCount),
      }))
      .sort((left, right) => right.score - left.score)[0];

    if (!best || best.score < 0.55) {
      return null;
    }

    try {
      await this.prisma.learnedRule.update({
        where: { id: best.rule.id },
        data: {
          usageCount: { increment: 1 },
        },
      });
    } catch (error) {
      if (!this.isMissingLearnedRuleTable(error)) {
        throw error;
      }
    }

    return {
      category: best.rule.detectedCategory,
      service: best.rule.detectedService,
      variables: this.parseVariables(best.rule.variables),
      suggestedServices: this.parseSuggestedServices(best.rule.suggestedServices),
      confidence: Number(Math.min(0.99, Math.max(best.rule.confidence, best.score)).toFixed(2)),
      matchedRuleId: best.rule.id,
      usageCount: best.rule.usageCount + 1,
    };
  }

  async learnFromSuggestion(params: {
    inputText: string;
    category: string | null;
    service: string | null;
    variables: Record<string, string | number>;
    suggestedServices: string[];
    confidence: number;
  }) {
    if (params.confidence < 0.6 || (!params.category && !params.service && !params.suggestedServices.length)) {
      return null;
    }

    const normalizedInput = this.normalizeInput(params.inputText);

    try {
      return await this.prisma.learnedRule.upsert({
        where: { normalizedInput },
        update: {
          inputText: params.inputText,
          detectedCategory: params.category,
          detectedService: params.service,
          variables: params.variables as Prisma.InputJsonValue,
          suggestedServices: params.suggestedServices as Prisma.InputJsonValue,
          confidence: params.confidence,
        },
        create: {
          inputText: params.inputText,
          normalizedInput,
          detectedCategory: params.category,
          detectedService: params.service,
          variables: params.variables as Prisma.InputJsonValue,
          suggestedServices: params.suggestedServices as Prisma.InputJsonValue,
          confidence: params.confidence,
        },
      });
    } catch (error) {
      if (this.isMissingLearnedRuleTable(error)) {
        return null;
      }

      throw error;
    }
  }

  async saveFeedback(inputText: string, original: unknown, corrected: FeedbackPayload) {
    const normalizedInput = this.normalizeInput(inputText);

    try {
      await this.prisma.aiFeedback.create({
        data: {
          inputText,
          normalizedInput,
          aiOutput: original as Prisma.InputJsonValue,
          userCorrectedOutput: corrected as Prisma.InputJsonValue,
        },
      });

      return await this.prisma.learnedRule.upsert({
        where: { normalizedInput },
        update: {
          inputText,
          detectedCategory: corrected.category,
          detectedService: corrected.service,
          variables: corrected.variables as Prisma.InputJsonValue,
          suggestedServices: corrected.suggested_services as Prisma.InputJsonValue,
          confidence: Math.max(0.9, corrected.confidence || 0.96),
        },
        create: {
          inputText,
          normalizedInput,
          detectedCategory: corrected.category,
          detectedService: corrected.service,
          variables: corrected.variables as Prisma.InputJsonValue,
          suggestedServices: corrected.suggested_services as Prisma.InputJsonValue,
          confidence: Math.max(0.9, corrected.confidence || 0.96),
          usageCount: 1,
        },
      });
    } catch (error) {
      if (this.isMissingLearnedRuleTable(error) || this.isMissingAiFeedbackTable(error)) {
        return null;
      }

      throw error;
    }
  }

  private extractKeywords(normalizedText: string) {
    return Array.from(
      new Set(
        normalizedText
          .split(' ')
          .map((token) => token.trim())
          .filter((token) => token.length > 2),
      ),
    );
  }

  private scoreRule(input: string, candidate: string, usageCount: number) {
    if (input === candidate) {
      return 0.99;
    }

    const inputTokens = new Set(this.extractKeywords(input));
    const candidateTokens = new Set(this.extractKeywords(candidate));
    const overlap = [...inputTokens].filter((token) => candidateTokens.has(token));
    const union = new Set([...inputTokens, ...candidateTokens]);
    const jaccard = union.size ? overlap.length / union.size : 0;
    const includesBoost = input.includes(candidate) || candidate.includes(input) ? 0.2 : 0;
    const usageBoost = Math.min(usageCount, 10) * 0.01;

    return Number(Math.min(0.99, jaccard + includesBoost + usageBoost).toFixed(3));
  }

  private parseVariables(value: Prisma.JsonValue) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    const entries = Object.entries(value).filter((entry): entry is [string, string | number] => {
      const [, current] = entry;
      return typeof current === 'string' || typeof current === 'number';
    });

    return Object.fromEntries(entries);
  }

  private parseSuggestedServices(value: Prisma.JsonValue) {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
  }

  private isMissingLearnedRuleTable(error: unknown) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2021' &&
      typeof error.message === 'string' &&
      error.message.includes('LearnedRule')
    );
  }

  private isMissingAiFeedbackTable(error: unknown) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2021' &&
      typeof error.message === 'string' &&
      error.message.includes('AiFeedback')
    );
  }
}
