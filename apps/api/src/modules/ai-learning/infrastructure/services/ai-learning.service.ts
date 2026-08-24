import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/infrastructure/prisma.service';
import { normalizeForMatching } from '../../../../shared/domain/text-similarity';
import {
  CreateAiLearningPromptDto,
  UpdateAiLearningPromptDto,
} from '../../application/dto/ai-learning-prompt.dto';
import { CreateAiLearningTrainingDto, PromoteTrainingDto } from '../../application/dto/ai-learning-training.dto';
import { CreateAiLearningDatasetDto } from '../../application/dto/ai-learning-dataset.dto';

type LearnedSuggestion = {
  category: string | null;
  service: string | null;
  variables: Record<string, string | number>;
  suggestedServices: string[];
  suggestedWorkItems: string[];
  rejectedServices: string[];
  rejectedWorkItems: string[];
  confidence: number;
  matchedRuleId: string;
  usageCount: number;
};

type FeedbackPayload = {
  category: string | null;
  service: string | null;
  variables: Record<string, string | number>;
  suggested_services: string[];
  suggested_work_items?: string[];
  rejected_services?: string[];
  rejected_work_items?: string[];
  confidence?: number;
};

@Injectable()
export class AiLearningService {
  constructor(private readonly prisma: PrismaService) {}

  /** Señales baratas y 100% confiables de si el motor local esta
   * realmente aprendiendo, sin depender de que un LLM evalue sus
   * propias sugerencias pasadas. */
  async getHealth() {
    const [totalRules, ruleUsage, feedbackCount, quotationsLearnedFrom, totalQuotations] =
      await Promise.all([
        this.prisma.learnedRule.count(),
        this.prisma.learnedRule.aggregate({ _sum: { usageCount: true } }),
        this.prisma.aiFeedback.count(),
        this.prisma.quotation.count({ where: { learnedAt: { not: null }, deletedAt: null } }),
        this.prisma.quotation.count({ where: { deletedAt: null } }),
      ]);

    return {
      totalRules,
      totalRuleUsage: ruleUsage._sum.usageCount || 0,
      feedbackCount,
      quotationsLearnedFrom,
      totalQuotations,
    };
  }

  async listPrompts() {
    try {
      return await this.prisma.aiLearningPrompt.findMany({
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      });
    } catch (error) {
      if (this.isMissingAiLearningPromptTable(error)) {
        return [];
      }

      throw error;
    }
  }

  async getActivePromptContext(mode = 'CATALOG_MATCH') {
    try {
      const prompts = await this.prisma.aiLearningPrompt.findMany({
        where: { isActive: true, mode },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
        take: 30,
      });

      return prompts
        .map((prompt) => {
          const examples = [
            prompt.inputExample ? `Entrada de ejemplo:\n${prompt.inputExample}` : '',
            prompt.outputExample ? `Salida de ejemplo:\n${prompt.outputExample}` : '',
          ]
            .filter(Boolean)
            .join('\n\n');

          return `${prompt.name}\n${prompt.systemPrompt}${examples ? `\n\n${examples}` : ''}`;
        })
        .join('\n\n---\n\n');
    } catch (error) {
      if (this.isMissingAiLearningPromptTable(error)) {
        return '';
      }

      throw error;
    }
  }

  async createPrompt(dto: CreateAiLearningPromptDto) {
    try {
      return await this.prisma.aiLearningPrompt.create({
        data: {
          mode: dto.mode?.trim() || 'CATALOG_MATCH',
          name: dto.name.trim(),
          systemPrompt: dto.systemPrompt.trim(),
          inputExample: dto.inputExample?.trim() || null,
          outputExample: dto.outputExample?.trim() || null,
          isActive: dto.isActive ?? true,
          sortOrder: dto.sortOrder ?? 0,
        },
      });
    } catch (error) {
      if (this.isMissingAiLearningPromptTable(error)) {
        return null;
      }

      throw error;
    }
  }

  async updatePrompt(id: string, dto: UpdateAiLearningPromptDto) {
    try {
      return await this.prisma.aiLearningPrompt.update({
        where: { id },
        data: {
          ...(dto.mode !== undefined ? { mode: dto.mode.trim() || 'CATALOG_MATCH' } : {}),
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.systemPrompt !== undefined ? { systemPrompt: dto.systemPrompt.trim() } : {}),
          ...(dto.inputExample !== undefined ? { inputExample: dto.inputExample.trim() || null } : {}),
          ...(dto.outputExample !== undefined ? { outputExample: dto.outputExample.trim() || null } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        },
      });
    } catch (error) {
      if (this.isMissingAiLearningPromptTable(error)) {
        return null;
      }

      throw error;
    }
  }

  async removePrompt(id: string) {
    try {
      await this.prisma.aiLearningPrompt.delete({
        where: { id },
      });

      return { deleted: true };
    } catch (error) {
      if (this.isMissingAiLearningPromptTable(error)) {
        return { deleted: false };
      }

      throw error;
    }
  }

  async createTrainingExample(dto: CreateAiLearningTrainingDto) {
    return this.prisma.trainingExample.create({
      data: {
        input: dto.input as Prisma.InputJsonValue,
        output: dto.output as Prisma.InputJsonValue,
        embedding: [],
        aceptado: dto.aceptado ?? true,
      },
    });
  }

  async promoteTrainingToRule(dto: PromoteTrainingDto) {
    const normalizedInput = this.normalizeInput(JSON.stringify(dto.input));
    const mode = dto.mode?.trim() || 'CATALOG_MATCH';

    const detected = (dto.output as Record<string, unknown>).detected as Record<string, unknown> | null;
    const suggestedItems = (dto.output as Record<string, unknown>).suggestedItems as Array<Record<string, unknown>> | undefined;
    const suggestedWorkItems = (dto.output as Record<string, unknown>).suggestedWorkItems as string[] | undefined;

    const variables =
      detected && typeof detected.variables === 'object' && detected.variables !== null
        ? (detected.variables as Record<string, unknown>)
        : {};

    return this.prisma.learnedRule.upsert({
      where: { mode_normalizedInput: { mode, normalizedInput } },
      create: {
        mode,
        inputText: JSON.stringify(dto.input),
        normalizedInput,
        detectedCategory: detected?.category as string | null,
        detectedService: detected?.service as string | null,
        variables: variables as Prisma.InputJsonValue,
        suggestedServices: (suggestedItems || []).map((item) => (item.service as string) || '') as Prisma.InputJsonValue,
        suggestedWorkItems: (suggestedWorkItems || []) as Prisma.InputJsonValue,
        rejectedServices: [],
        rejectedWorkItems: [],
        confidence: (dto.output as Record<string, unknown>).confidence as number || 0.9,
      },
      update: {
        inputText: JSON.stringify(dto.input),
        detectedCategory: detected?.category as string | null,
        detectedService: detected?.service as string | null,
        variables: variables as Prisma.InputJsonValue,
        suggestedServices: (suggestedItems || []).map((item) => (item.service as string) || '') as Prisma.InputJsonValue,
        suggestedWorkItems: (suggestedWorkItems || []) as Prisma.InputJsonValue,
        confidence: (dto.output as Record<string, unknown>).confidence as number || 0.9,
      },
    });
  }

  async createTrainingFromDataset(dto: CreateAiLearningDatasetDto) {
    return this.prisma.$transaction(
      dto.trainingDataset.map((entry) =>
        this.prisma.trainingExample.create({
          data: {
            input: entry.input as Prisma.InputJsonValue,
            output: entry.output as Prisma.InputJsonValue,
            embedding: [],
            aceptado: entry.aceptado ?? true,
          },
        }),
      ),
    );
  }

  async listTrainingExamples() {
    return this.prisma.trainingExample.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }

  async deleteTrainingExample(id: string) {
    try {
      await this.prisma.trainingExample.delete({ where: { id } });
      return { deleted: true };
    } catch (error) {
      if (this.isMissingTrainingExampleTable(error)) {
        return { deleted: false };
      }

      throw error;
    }
  }

  private isMissingTrainingExampleTable(error: unknown) {
    return (
      error instanceof Error &&
      'code' in error &&
      (error as { code?: string }).code === 'P2021' &&
      typeof error.message === 'string' &&
      error.message.includes('TrainingExample')
    );
  }

  normalizeInput(text: string) {
    return normalizeForMatching(text);
  }

  async findBestRule(inputText: string, mode = 'CATALOG_MATCH'): Promise<LearnedSuggestion | null> {
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
              mode,
            }
          : { mode },
        orderBy: [{ usageCount: 'desc' }, { updatedAt: 'desc' }],
        take: 40,
      });

      fallbackCandidates = !candidates.length
        ? await this.prisma.learnedRule.findMany({
            where: { mode },
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
      suggestedWorkItems: this.parseSuggestedServices(best.rule.suggestedWorkItems),
      rejectedServices: this.parseSuggestedServices(best.rule.rejectedServices),
      rejectedWorkItems: this.parseSuggestedServices(best.rule.rejectedWorkItems),
      confidence: Number(Math.min(0.99, Math.max(best.rule.confidence, best.score)).toFixed(2)),
      matchedRuleId: best.rule.id,
      usageCount: best.rule.usageCount + 1,
    };
  }

  async learnFromSuggestion(params: {
    mode?: string;
    inputText: string;
    category: string | null;
    service: string | null;
    variables: Record<string, string | number>;
    suggestedServices: string[];
    suggestedWorkItems?: string[];
    rejectedServices?: string[];
    rejectedWorkItems?: string[];
    confidence: number;
  }) {
    if (params.confidence < 0.6 || (!params.category && !params.service && !params.suggestedServices.length)) {
      return null;
    }

    const normalizedInput = this.normalizeInput(params.inputText);
    const mode = params.mode || 'CATALOG_MATCH';

    try {
      return await this.prisma.learnedRule.upsert({
        where: { mode_normalizedInput: { mode, normalizedInput } },
        update: {
          mode,
          inputText: params.inputText,
          detectedCategory: params.category,
          detectedService: params.service,
          variables: params.variables as Prisma.InputJsonValue,
          suggestedServices: params.suggestedServices as Prisma.InputJsonValue,
          suggestedWorkItems: (params.suggestedWorkItems || []) as Prisma.InputJsonValue,
          rejectedServices: (params.rejectedServices || []) as Prisma.InputJsonValue,
          rejectedWorkItems: (params.rejectedWorkItems || []) as Prisma.InputJsonValue,
          confidence: params.confidence,
        },
        create: {
          mode,
          inputText: params.inputText,
          normalizedInput,
          detectedCategory: params.category,
          detectedService: params.service,
          variables: params.variables as Prisma.InputJsonValue,
          suggestedServices: params.suggestedServices as Prisma.InputJsonValue,
          suggestedWorkItems: (params.suggestedWorkItems || []) as Prisma.InputJsonValue,
          rejectedServices: (params.rejectedServices || []) as Prisma.InputJsonValue,
          rejectedWorkItems: (params.rejectedWorkItems || []) as Prisma.InputJsonValue,
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

  async saveFeedback(inputText: string, original: unknown, corrected: FeedbackPayload, mode = 'CATALOG_MATCH') {
    const normalizedInput = this.normalizeInput(inputText);

    try {
      await this.prisma.aiFeedback.create({
        data: {
          mode,
          inputText,
          normalizedInput,
          aiOutput: original as Prisma.InputJsonValue,
          userCorrectedOutput: corrected as Prisma.InputJsonValue,
        },
      });

      return await this.prisma.learnedRule.upsert({
        where: { mode_normalizedInput: { mode, normalizedInput } },
        update: {
          mode,
          inputText,
          detectedCategory: corrected.category,
          detectedService: corrected.service,
          variables: corrected.variables as Prisma.InputJsonValue,
          suggestedServices: corrected.suggested_services as Prisma.InputJsonValue,
          suggestedWorkItems: (corrected.suggested_work_items || []) as Prisma.InputJsonValue,
          rejectedServices: (corrected.rejected_services || []) as Prisma.InputJsonValue,
          rejectedWorkItems: (corrected.rejected_work_items || []) as Prisma.InputJsonValue,
          confidence: Math.max(0.9, corrected.confidence || 0.96),
        },
        create: {
          mode,
          inputText,
          normalizedInput,
          detectedCategory: corrected.category,
          detectedService: corrected.service,
          variables: corrected.variables as Prisma.InputJsonValue,
          suggestedServices: corrected.suggested_services as Prisma.InputJsonValue,
          suggestedWorkItems: (corrected.suggested_work_items || []) as Prisma.InputJsonValue,
          rejectedServices: (corrected.rejected_services || []) as Prisma.InputJsonValue,
          rejectedWorkItems: (corrected.rejected_work_items || []) as Prisma.InputJsonValue,
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

  private isMissingAiLearningPromptTable(error: unknown) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2021' &&
      typeof error.message === 'string' &&
      error.message.includes('AiLearningPrompt')
    );
  }
}
