import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/infrastructure/prisma.service';

type FrequencyEntry = { name: string; count: number };

const MAX_TRACKED_ENTRIES = 20;

/**
 * Detecta patrones de cliente e industria a partir de datos reales del
 * negocio (servicios/work-items/viaticos por cotizacion) — pura agregacion
 * estadistica, sin llamar a ningun proveedor de IA. Se recalcula en cada
 * cotizacion creada/editada, desde el mismo punto de entrada que ya
 * alimenta LearnedRule (quotations.service.ts -> recordQuotationLearning).
 */
@Injectable()
export class ClientInsightsService {
  private readonly logger = new Logger(ClientInsightsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async recalculatePatterns(params: {
    clientId: string;
    industry: string | null;
    services: string[];
    workItems: string[];
    travelLocations: string[];
    total: number;
  }): Promise<void> {
    try {
      const existing = await this.prisma.clientPattern.findUnique({
        where: { clientId: params.clientId },
      });

      const nextQuotationCount = (existing?.quotationCount || 0) + 1;
      const previousAvg = existing?.avgTotal ? Number(existing.avgTotal) : 0;
      const nextAvgTotal =
        (previousAvg * (existing?.quotationCount || 0) + params.total) / nextQuotationCount;

      await this.prisma.clientPattern.upsert({
        where: { clientId: params.clientId },
        update: {
          industry: params.industry,
          quotationCount: nextQuotationCount,
          frequentServices: this.mergeFrequency(
            this.parseFrequency(existing?.frequentServices),
            params.services,
          ) as Prisma.InputJsonValue,
          frequentWorkItems: this.mergeFrequency(
            this.parseFrequency(existing?.frequentWorkItems),
            params.workItems,
          ) as Prisma.InputJsonValue,
          travelLocations: this.mergeFrequency(
            this.parseFrequency(existing?.travelLocations),
            params.travelLocations,
          ) as Prisma.InputJsonValue,
          avgTotal: nextAvgTotal,
          lastQuotationAt: new Date(),
        },
        create: {
          clientId: params.clientId,
          industry: params.industry,
          quotationCount: 1,
          frequentServices: this.mergeFrequency([], params.services) as Prisma.InputJsonValue,
          frequentWorkItems: this.mergeFrequency([], params.workItems) as Prisma.InputJsonValue,
          travelLocations: this.mergeFrequency([], params.travelLocations) as Prisma.InputJsonValue,
          avgTotal: params.total,
          lastQuotationAt: new Date(),
        },
      });

      if (params.industry) {
        await this.recalculateIndustryPattern(params.industry, params.services, params.workItems);
      }
    } catch (error) {
      this.logger.error('recalculatePatterns failed', error instanceof Error ? error.stack : error);
    }
  }

  private async recalculateIndustryPattern(industry: string, services: string[], workItems: string[]) {
    const existing = await this.prisma.industryPattern.findUnique({ where: { industry } });
    const clientCount = await this.prisma.client.count({
      where: { industry, deletedAt: null, quotations: { some: { deletedAt: null } } },
    });

    await this.prisma.industryPattern.upsert({
      where: { industry },
      update: {
        clientCount,
        quotationCount: (existing?.quotationCount || 0) + 1,
        frequentServices: this.mergeFrequency(
          this.parseFrequency(existing?.frequentServices),
          services,
        ) as Prisma.InputJsonValue,
        frequentWorkItems: this.mergeFrequency(
          this.parseFrequency(existing?.frequentWorkItems),
          workItems,
        ) as Prisma.InputJsonValue,
      },
      create: {
        industry,
        clientCount,
        quotationCount: 1,
        frequentServices: this.mergeFrequency([], services) as Prisma.InputJsonValue,
        frequentWorkItems: this.mergeFrequency([], workItems) as Prisma.InputJsonValue,
      },
    });
  }

  /** Cuenta cada nombre una sola vez por cotizacion (presencia, no repeticiones dentro de la misma). */
  private mergeFrequency(existing: FrequencyEntry[], newItems: string[]): FrequencyEntry[] {
    const counts = new Map(existing.map((entry) => [entry.name, entry.count]));

    for (const name of new Set(newItems.map((item) => item.trim()).filter(Boolean))) {
      counts.set(name, (counts.get(name) || 0) + 1);
    }

    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((left, right) => right.count - left.count)
      .slice(0, MAX_TRACKED_ENTRIES);
  }

  private parseFrequency(value: Prisma.JsonValue | undefined): FrequencyEntry[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter(
      (entry): entry is FrequencyEntry =>
        Boolean(entry) &&
        typeof entry === 'object' &&
        typeof (entry as FrequencyEntry).name === 'string' &&
        typeof (entry as FrequencyEntry).count === 'number',
    );
  }

  async getClientInsights(clientId: string) {
    const pattern = await this.prisma.clientPattern.findUnique({ where: { clientId } });
    if (pattern) {
      return {
        source: 'client' as const,
        quotationCount: pattern.quotationCount,
        frequentServices: this.parseFrequency(pattern.frequentServices).slice(0, 8),
        frequentWorkItems: this.parseFrequency(pattern.frequentWorkItems).slice(0, 8),
        travelLocations: this.parseFrequency(pattern.travelLocations).slice(0, 5),
        avgTotal: pattern.avgTotal ? Number(pattern.avgTotal) : null,
      };
    }

    const client = await this.prisma.client.findUnique({ where: { id: clientId } });
    if (!client?.industry) {
      return null;
    }

    const industryPattern = await this.prisma.industryPattern.findUnique({
      where: { industry: client.industry },
    });
    if (!industryPattern || industryPattern.quotationCount < 2) {
      return null;
    }

    return {
      source: 'industry' as const,
      industry: client.industry,
      quotationCount: industryPattern.quotationCount,
      frequentServices: this.parseFrequency(industryPattern.frequentServices).slice(0, 8),
      frequentWorkItems: this.parseFrequency(industryPattern.frequentWorkItems).slice(0, 8),
      travelLocations: [] as FrequencyEntry[],
      avgTotal: null,
    };
  }
}
