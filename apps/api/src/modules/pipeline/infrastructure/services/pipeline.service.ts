import { Injectable } from '@nestjs/common';
import { Prisma, QuotationStatus } from '@prisma/client';
import { PrismaService } from '../../../../shared/infrastructure/prisma.service';

const DEFAULT_STAGES: Array<{
  name: string;
  code: QuotationStatus | 'PERDIDA';
  order: number;
  probability: number;
}> = [
  { name: 'Borrador', code: 'BORRADOR', order: 1, probability: 0.05 },
  { name: 'Nueva', code: 'NUEVA', order: 2, probability: 0.1 },
  { name: 'En proceso', code: 'EN_PROCESO', order: 3, probability: 0.3 },
  { name: 'Enviada', code: 'ENVIADA', order: 4, probability: 0.55 },
  { name: 'Vista', code: 'VISTA', order: 5, probability: 0.7 },
  { name: 'Negociación', code: 'NEGOCIACION', order: 6, probability: 0.82 },
  { name: 'Aceptada', code: 'ACEPTADA', order: 7, probability: 1 },
  { name: 'Rechazada', code: 'RECHAZADA', order: 8, probability: 0 },
  { name: 'Vencida', code: 'VENCIDA', order: 9, probability: 0 },
  { name: 'Ejecutada', code: 'EJECUTADA', order: 10, probability: 1 },
  { name: 'Cuentas por cobrar', code: 'CUENTAS_POR_COBRAR', order: 11, probability: 1 },
  { name: 'Pagada', code: 'PAGADA', order: 12, probability: 1 },
];

@Injectable()
export class PipelineService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureDefaultPipeline() {
    const pipeline = await this.prisma.pipeline.upsert({
      where: {
        objectType_isDefault: {
          objectType: 'deals',
          isDefault: true,
        },
      },
      update: { name: 'Pipeline Comercial' },
      create: {
        name: 'Pipeline Comercial',
        objectType: 'deals',
        isDefault: true,
      },
    });

    await this.prisma.$transaction(async (tx) => {
      const existingStages = await tx.dealStage.findMany({
        where: { pipelineId: pipeline.id },
        orderBy: { order: 'asc' },
      });

      // Move existing rows out of the target order range first to avoid unique collisions on (pipelineId, order).
      for (const [index, stage] of existingStages.entries()) {
        await tx.dealStage.update({
          where: { id: stage.id },
          data: {
            order: 100 + index,
          },
        });
      }

      for (const stage of DEFAULT_STAGES) {
        await tx.dealStage.upsert({
          where: {
            pipelineId_code: {
              pipelineId: pipeline.id,
              code: stage.code,
            },
          },
          update: {
            name: stage.name,
            order: stage.order,
            probability: new Prisma.Decimal(stage.probability),
          },
          create: {
            pipelineId: pipeline.id,
            name: stage.name,
            code: stage.code,
            order: stage.order,
            probability: new Prisma.Decimal(stage.probability),
          },
        });
      }
    });

    return this.prisma.pipeline.findUnique({
      where: { id: pipeline.id },
      include: {
        stages: { orderBy: { order: 'asc' } },
      },
    });
  }

  async getKanban() {
    const pipeline = await this.ensureDefaultPipeline();
    const quotations = await this.prisma.quotation.findMany({
      where: { deletedAt: null },
      include: {
        client: true,
        stage: true,
        items: true,
        createdBy: true,
        activities: { orderBy: { createdAt: 'desc' } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return {
      pipeline,
      stages:
        pipeline?.stages.map((stage) => ({
          id: stage.id,
          name: stage.name,
          code: stage.code,
          order: stage.order,
          probability: Number(stage.probability),
          deals: quotations
            .filter((quotation) => quotation.stageId === stage.id)
            .map((quotation) => ({
              id: quotation.id,
              folio: quotation.folio,
              title: quotation.title,
              total: quotation.total,
              currency: quotation.currency,
              forecastAmount: Number(quotation.total) * Number(stage.probability),
              status: quotation.status,
              createdAt: quotation.createdAt,
              updatedAt: quotation.updatedAt,
              client: {
                id: quotation.client.id,
                legalName: quotation.client.legalName,
              },
              createdBy: {
                id: quotation.createdBy.id,
                name:
                  quotation.createdBy.email === 'admin@local.dev' ||
                  quotation.createdBy.name === 'System Admin'
                    ? 'Juan Ramon Alvarez Echavarria'
                    : quotation.createdBy.name,
              },
              itemsCount: quotation.items.length,
              lastActivity:
                quotation.activities[0]?.description || quotation.notes || 'Sin actividad reciente',
            })),
        })) || [],
    };
  }

  async getPipelineSummary() {
    const pipeline = await this.ensureDefaultPipeline();
    const quotations = await this.prisma.quotation.findMany({
      where: { deletedAt: null, stageId: { not: null } },
      include: { stage: true },
    });

    const totalAmount = quotations.reduce((sum, quotation) => sum + Number(quotation.total), 0);
    const forecastAmount = quotations.reduce((sum, quotation) => {
      return sum + Number(quotation.total) * Number(quotation.stage?.probability || 0);
    }, 0);

    return {
      pipeline,
      metrics: {
        deals: quotations.length,
        totalAmount,
        forecastAmount,
        weightedCoverage: quotations.length
          ? Number(((forecastAmount / Math.max(totalAmount, 1)) * 100).toFixed(1))
          : 0,
      },
    };
  }

  async getStageByStatus(status: QuotationStatus) {
    const pipeline = await this.ensureDefaultPipeline();

    return this.prisma.dealStage.findUnique({
      where: {
        pipelineId_code: {
          pipelineId: pipeline!.id,
          code: status,
        },
      },
    });
  }

  async validateStageTransition(currentStatus: QuotationStatus, nextStatus: QuotationStatus) {
    if (currentStatus === nextStatus) {
      return;
    }

    const pipeline = await this.ensureDefaultPipeline();
    const currentStage = pipeline?.stages.find((stage) => stage.code === currentStatus);
    const nextStage = pipeline?.stages.find((stage) => stage.code === nextStatus);

    if (!currentStage || !nextStage) {
      return;
    }

    if (
      ['RECHAZADA', 'VENCIDA', 'ACEPTADA', 'EJECUTADA', 'CUENTAS_POR_COBRAR', 'PAGADA'].includes(
        nextStatus,
      )
    ) {
      return;
    }

    if (Math.abs(nextStage.order - currentStage.order) > 2) {
      throw new Error('No se permite saltar etapas del pipeline en un solo movimiento');
    }
  }
}
