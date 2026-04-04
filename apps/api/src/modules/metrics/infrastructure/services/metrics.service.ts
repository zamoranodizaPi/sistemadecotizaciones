import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/infrastructure/prisma.service';

@Injectable()
export class MetricsService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboardMetrics() {
    const quotations = await this.prisma.quotation.findMany({
      where: { deletedAt: null },
      include: { items: true, client: true },
    });

    const accepted = quotations.filter((quotation) => quotation.status === 'ACEPTADA').length;
    const total = quotations.length || 1;
    const revenue = quotations.reduce(
      (sum, quotation) => sum + Number(quotation.total),
      0,
    );
    const forecast = quotations.reduce((sum, quotation) => {
      const probabilityMap: Record<string, number> = {
        BORRADOR: 0.05,
        NUEVA: 0.1,
        EN_PROCESO: 0.3,
        ENVIADA: 0.55,
        VISTA: 0.7,
        NEGOCIACION: 0.82,
        ACEPTADA: 1,
        RECHAZADA: 0,
        VENCIDA: 0,
        EJECUTADA: 1,
        CUENTAS_POR_COBRAR: 1,
        PAGADA: 1,
      };

      return sum + Number(quotation.total) * (probabilityMap[quotation.status] || 0);
    }, 0);

    const services = new Map<string, number>();
    const revenueByClient = new Map<string, number>();
    const pipeline = new Map<string, number>();

    for (const quotation of quotations) {
      revenueByClient.set(
        quotation.client.legalName,
        (revenueByClient.get(quotation.client.legalName) || 0) + Number(quotation.total),
      );
      pipeline.set(
        quotation.status,
        (pipeline.get(quotation.status) || 0) + Number(quotation.total),
      );

      for (const item of quotation.items) {
        services.set(item.serviceName, (services.get(item.serviceName) || 0) + Number(item.quantity));
      }
    }

    return {
      totalQuotations: quotations.length,
      conversionRate: Number(((accepted / total) * 100).toFixed(2)),
      revenue,
      forecast,
      topServices: Array.from(services.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5),
      revenueByClient: Array.from(revenueByClient.entries()).sort((a, b) => b[1] - a[1]),
      pipelineByStatus: Array.from(pipeline.entries()),
    };
  }
}
