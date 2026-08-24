import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ActivityType,
  ApprovalStatus,
  Prisma,
  Quotation,
  QuotationItem,
  QuotationStatus,
  SpecialConsiderationType,
  UserRole,
} from '@prisma/client';

type QuotationWithRelations = Quotation & {
  client?: { legalName: string | null };
  items?: QuotationItem[];
};
import { PrismaService } from '../../../../shared/infrastructure/prisma.service';
import { CatalogService } from '../../../catalog/infrastructure/services/catalog.service';
import { AiLearningService } from '../../../ai-learning/infrastructure/services/ai-learning.service';
import { AiLearningLogService } from '../../../ai-learning/infrastructure/services/ai-learning-log.service';
import {
  CreateServiceCatalogDto,
  CreateReusableTextBlockDto,
  CreateWorkItemCatalogDto,
  CreateQuotationActivityDto,
  CreateQuotationDto,
  UpdateQuotationDto,
  UpdateServiceCatalogDto,
  UpdateReusableTextBlockDto,
  UpdateWorkItemCatalogDto,
  UpdateQuotationTemplateDto,
  UpdateQuotationCommercialDto,
} from '../../application/dto/create-quotation.dto';
import { PdfService } from './pdf.service';
import { PipelineService } from '../../../pipeline/infrastructure/services/pipeline.service';
import { CompanyProfileService } from '../../../company-profile/infrastructure/services/company-profile.service';
import { ReporteWordService } from './reporte-word.service';

@Injectable()
export class QuotationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogService: CatalogService,
    private readonly pdfService: PdfService,
    private readonly pipelineService: PipelineService,
    private readonly aiLearningService: AiLearningService,
    private readonly aiLearningLogService: AiLearningLogService,
    private readonly companyProfileService: CompanyProfileService,
    private readonly reporteWordService: ReporteWordService,
  ) {}

  private isFolioUniqueConflict(error: unknown) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
      return false;
    }

    const target = Array.isArray(error.meta?.target)
      ? error.meta?.target.map((value) => String(value))
      : typeof error.meta?.target === 'string'
        ? [error.meta.target]
        : [];

    return target.includes('folio');
  }

  private async getNextAvailableFolio(year = new Date().getFullYear()) {
    const suffix = `-${year}`;
    const latest = await this.prisma.quotation.findFirst({
      where: {
        folio: {
          startsWith: 'COT.',
          endsWith: suffix,
        },
      },
      select: { folio: true },
      orderBy: { folio: 'desc' },
    });

    const latestSequence = latest?.folio.match(/^COT\.(\d+)-\d{4}$/)?.[1];
    let sequence = latestSequence ? Number(latestSequence) + 1 : 1;

    while (true) {
      const folio = `COT.${String(sequence).padStart(4, '0')}-${year}`;
      const existing = await this.prisma.quotation.findUnique({
        where: { folio },
        select: { id: true },
      });

      if (!existing) {
        return folio;
      }

      sequence += 1;
    }
  }

  private async createQuotationWithResolvedFolio<T>(factory: (folio: string) => Promise<T>) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const folio = await this.getNextAvailableFolio();

      try {
        return await factory(folio);
      } catch (error) {
        if (this.isFolioUniqueConflict(error)) {
          continue;
        }

        throw error;
      }
    }

    throw new ConflictException('No fue posible asignar un folio único para la cotización.');
  }

  listQuotations() {
    return this.prisma.quotation.findMany({
      where: { deletedAt: null },
      include: {
        client: true,
        items: true,
        specialConsiderations: {
          orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
        stage: true,
        pipeline: true,
        createdBy: true,
        approvedBy: true,
        activities: { orderBy: { createdAt: 'desc' } },
      },
      orderBy: { createdAt: 'desc' },
    }).then((quotations) =>
      quotations.map((quotation) => ({
        ...quotation,
        createdBy: {
          ...quotation.createdBy,
          name: this.normalizeOwnerName(quotation.createdBy.name, quotation.createdBy.email),
        },
      })),
    );
  }

  async getCommercialTemplate() {
    const existing = await this.prisma.quotationTemplateSetting.findUnique({
      where: { name: 'default' },
    });

    if (existing) {
      const normalizedSections = this.normalizeCommercialSections(
        Array.isArray(existing.sections)
          ? (existing.sections as Array<{ title: string; content: string }>)
          : [],
      );

      if (JSON.stringify(normalizedSections) !== JSON.stringify(existing.sections)) {
        return this.prisma.quotationTemplateSetting.update({
          where: { id: existing.id },
          data: {
            sections: this.toJsonSections(normalizedSections),
          },
        });
      }

      return existing;
    }

    return this.prisma.quotationTemplateSetting.create({
      data: {
        name: 'default',
        sections: this.toJsonSections(await this.defaultCommercialSections()),
      },
    });
  }

  listSpecialConsiderationCatalog() {
    return this.prisma.specialConsiderationCatalog.findMany({
      orderBy: [{ type: 'asc' }, { updatedAt: 'desc' }],
    }).then((rows) => {
      const seen = new Set<string>();
      return rows.filter((row) => {
        const key =
          row.type === SpecialConsiderationType.PERCENTAGE
            ? `${row.type}:${row.concept}:${row.quantity?.toString() || '1'}:${row.percentage?.toString() || ''}:${row.mxnAmount?.toString() || ''}:${row.usdAmount?.toString() || ''}`
            : `${row.type}:${row.location}:${row.mxnAmount?.toString() || ''}:${row.usdAmount?.toString() || ''}`;

        if (seen.has(key)) {
          return false;
        }

        seen.add(key);
        return true;
      });
    });
  }

  listServiceTemplates() {
    return this.prisma.serviceCatalog.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
    });
  }

  async createServiceTemplate(dto: CreateServiceCatalogDto) {
    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException('El nombre del servicio es obligatorio.');
    }

    const existing = await this.prisma.serviceCatalog.findUnique({
      where: { name },
    });

    if (existing && existing.deletedAt === null) {
      throw new ConflictException('Ya existe un servicio con ese nombre.');
    }

    const data = {
      name,
      templateType: dto.templateType?.trim() || null,
      items: dto.items as unknown as Prisma.InputJsonValue,
      commercialSections: this.buildActivitySections(dto.activityNames) as Prisma.InputJsonValue,
      specialConsiderations: Prisma.JsonNull,
      deletedAt: null,
    };

    if (existing) {
      return this.prisma.serviceCatalog.update({
        where: { id: existing.id },
        data,
      });
    }

    return this.prisma.serviceCatalog.create({ data });
  }

  async updateServiceTemplate(id: string, dto: UpdateServiceCatalogDto) {
    const existing = await this.prisma.serviceCatalog.findFirst({
      where: { id, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException('El servicio solicitado ya no existe.');
    }

    const name = dto.name.trim();
    const duplicated = await this.prisma.serviceCatalog.findUnique({
      where: { name },
    });

    if (duplicated && duplicated.id !== id && duplicated.deletedAt === null) {
      throw new ConflictException('Ya existe otro servicio con ese nombre.');
    }

    return this.prisma.serviceCatalog.update({
      where: { id },
      data: {
        name,
        templateType: dto.templateType?.trim() || null,
        items: dto.items as unknown as Prisma.InputJsonValue,
        commercialSections: this.buildActivitySections(dto.activityNames) as Prisma.InputJsonValue,
      },
    });
  }

  async deleteServiceTemplate(id: string) {
    const existing = await this.prisma.serviceCatalog.findFirst({
      where: { id, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException('El servicio solicitado ya no existe.');
    }

    return this.prisma.serviceCatalog.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async listWorkItemCatalog() {
    return this.prisma.activityCatalog.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
    });
  }

  listReusableTextBlocks() {
    return this.prisma.reusableTextBlock.findMany({
      where: { deletedAt: null },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });
  }

  async createWorkItemCatalog(dto: CreateWorkItemCatalogDto) {
    const name = this.normalizeWorkItemName(dto.name);
    const code = dto.code?.trim().toUpperCase() || undefined;
    const unitPrice = Number(dto.unitPrice || 0);
    const existing = await this.prisma.activityCatalog.findUnique({
      where: { name },
    });
    const existingByCode = code
      ? await this.prisma.activityCatalog.findUnique({
          where: { code },
        })
      : null;

    if (existingByCode && existingByCode.deletedAt === null && existingByCode.name !== name) {
      throw new ConflictException('Ya existe una actividad con esa clave.');
    }

    if (existing && existing.deletedAt === null) {
      throw new ConflictException('Ya existe un trabajo con ese nombre.');
    }

    if (existing) {
      const updated = await this.prisma.activityCatalog.update({
        where: { id: existing.id },
        data: { name, code, unitPrice, deletedAt: null },
      });
      await this.catalogService.syncActivityCatalogToConceptCategory();
      return updated;
    }

    const created = await this.prisma.activityCatalog.create({
      data: { name, code, unitPrice },
    });
    await this.catalogService.syncActivityCatalogToConceptCategory();
    return created;
  }

  async updateWorkItemCatalog(id: string, dto: UpdateWorkItemCatalogDto) {
    const existing = await this.prisma.activityCatalog.findFirst({
      where: { id, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException('El trabajo solicitado ya no existe.');
    }

    const name = this.normalizeWorkItemName(dto.name);
    const code = dto.code?.trim().toUpperCase() || undefined;
    const unitPrice = dto.unitPrice === undefined ? undefined : Number(dto.unitPrice || 0);
    const duplicated = await this.prisma.activityCatalog.findUnique({
      where: { name },
    });
    const duplicatedByCode = code
      ? await this.prisma.activityCatalog.findUnique({
          where: { code },
        })
      : null;

    if (duplicated && duplicated.id !== id && duplicated.deletedAt === null) {
      throw new ConflictException('Ya existe otro trabajo con ese nombre.');
    }

    if (duplicated && duplicated.id !== id && duplicated.deletedAt !== null) {
      throw new ConflictException('Ya existe un trabajo archivado con ese nombre.');
    }

    if (duplicatedByCode && duplicatedByCode.id !== id && duplicatedByCode.deletedAt === null) {
      throw new ConflictException('Ya existe otra actividad con esa clave.');
    }

    const updated = await this.prisma.activityCatalog.update({
      where: { id },
      data: { name, code, unitPrice },
    });
    await this.catalogService.syncActivityCatalogToConceptCategory();
    return updated;
  }

  async deleteWorkItemCatalog(id: string) {
    const existing = await this.prisma.activityCatalog.findFirst({
      where: { id, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException('El trabajo solicitado ya no existe.');
    }

    const deleted = await this.prisma.activityCatalog.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await this.catalogService.syncActivityCatalogToConceptCategory();
    return deleted;
  }

  async createReusableTextBlock(dto: CreateReusableTextBlockDto) {
    const normalized = this.normalizeReusableTextBlock(dto);
    const existing = await this.prisma.reusableTextBlock.findFirst({
      where: {
        name: normalized.name,
        type: normalized.type,
      },
    });

    if (existing && existing.deletedAt === null) {
      throw new ConflictException('Ya existe un bloque reutilizable con ese nombre y tipo.');
    }

    if (existing) {
      return this.prisma.reusableTextBlock.update({
        where: { id: existing.id },
        data: { ...normalized, deletedAt: null },
      });
    }

    return this.prisma.reusableTextBlock.create({ data: normalized });
  }

  async updateReusableTextBlock(id: string, dto: UpdateReusableTextBlockDto) {
    const existing = await this.prisma.reusableTextBlock.findFirst({
      where: { id, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException('El bloque reutilizable ya no existe.');
    }

    const normalized = this.normalizeReusableTextBlock(dto);

    return this.prisma.reusableTextBlock.update({
      where: { id },
      data: normalized,
    });
  }

  async deleteReusableTextBlock(id: string) {
    const existing = await this.prisma.reusableTextBlock.findFirst({
      where: { id, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException('El bloque reutilizable ya no existe.');
    }

    return this.prisma.reusableTextBlock.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async updateCommercialTemplate(dto: UpdateQuotationTemplateDto) {
    const sections = this.toJsonSections(this.normalizeCommercialSections(dto.sections));
    return this.prisma.quotationTemplateSetting.upsert({
      where: { name: 'default' },
      update: {
        sections,
      },
      create: {
        name: 'default',
        sections,
      },
    });
  }

  async createQuotation(dto: CreateQuotationDto, actorUserId?: string) {
    try {
      const client = await this.resolveQuotationClient(dto);
      const pricing = await this.buildPricingPayload(dto);
      const {
        itemRows,
        specialConsiderationRows,
        subtotal,
        finalChargeRate,
        tax,
        total,
        currency,
        discountPercent,
        requiresApproval,
        approvalStatus,
        pricingRuleLabel,
      } = pricing;
      const commercialSections =
        dto.commercialSections?.length
          ? this.normalizeCommercialSections(dto.commercialSections)
          : await this.resolveCommercialSectionsFromTemplate(dto);
      const commercialSectionsJson = this.toJsonSections(commercialSections);
      const requestedOwner =
        dto.createdById
          ? await this.prisma.user.findFirst({
              where: {
                id: dto.createdById,
                isActive: true,
                role: {
                  in: [UserRole.ADMIN, UserRole.SALES],
                },
              },
            })
          : null;

      const ownerId =
        requestedOwner?.id ||
        actorUserId ||
        (await this.prisma.user.findFirst({
          where: {
            isActive: true,
            role: {
              in: [UserRole.ADMIN, UserRole.SALES],
            },
          },
          orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
        }))?.id ||
        (await this.ensureSystemUser());

      const quotation = await this.createQuotationWithResolvedFolio((folio) =>
        this.prisma.quotation.create({
          data: {
            folio,
            clientId: client.id,
            contactName: dto.contactName?.trim() || null,
            pipelineId: null,
            stageId: null,
            rootQuotationId: null,
            previousVersionId: null,
            serviceType: dto.serviceType?.trim() || null,
            templateType: dto.templateType?.trim() || null,
            coverTitle: dto.coverTitle?.trim() || dto.title,
            executiveSummary: dto.executiveSummary?.trim() || null,
            versionNumber: 1,
            validUntil: this.resolveValidUntil(dto.validityDays),
            pricingRule: dto.pricingRule?.trim() || null,
            pricingRuleLabel,
            partCount: Math.max(0, dto.partCount ?? 0),
            discountPercent,
            requiresApproval,
            approvalStatus,
            title: dto.title,
            notes: dto.notes,
            durationOfWork: dto.durationOfWork,
            termsAndConditions: dto.termsAndConditions,
            commercialSections: commercialSectionsJson,
            currency,
            finalChargeRate,
            createdById: ownerId,
            subtotal,
            tax,
            total,
            items: { create: itemRows },
            specialConsiderations: { create: specialConsiderationRows },
            history: {
              create: {
                eventType: 'QUOTATION_CREATED',
                toStatus: QuotationStatus.BORRADOR,
                payload: { items: itemRows.length, versionNumber: 1, requiresApproval },
              },
            },
            activities: {
              create: {
                type: ActivityType.DEAL_CREATED,
                description: `Cotización creada por ${currency} ${total.toFixed(2)}`,
                payload: {
                  total,
                  currency,
                  ownerId: requestedOwner?.id || null,
                  pricingRuleLabel,
                  validUntil: this.resolveValidUntil(dto.validityDays),
                },
                userId: actorUserId,
              },
            },
          },
          include: {
            client: true,
            items: true,
            specialConsiderations: {
              orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
            },
            stage: true,
            activities: true,
            createdBy: true,
          },
        }),
      );

      await this.syncSpecialConsiderationCatalog(specialConsiderationRows);
      await this.syncServiceTemplate(dto);
      await this.syncWorkItemCatalog(commercialSections);
      await this.recordQuotationLearning(quotation);

      return quotation;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2022'
      ) {
        throw new BadRequestException(
          'La base local no tiene las columnas nuevas para cotizaciones. Aplica las migraciones pendientes y reinicia la API.',
        );
      }

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new BadRequestException('Ya existe un dato único en conflicto para la cotización.');
      }

      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error;
      }

      if (error instanceof Error) {
        console.error('createQuotation failed:', error);
        throw new BadRequestException(`No fue posible crear la cotización: ${error.message}`);
      }

      throw error;
    }
  }

  async updateQuotationFromBuilder(id: string, dto: CreateQuotationDto, actorUserId?: string) {
    const quotation = await this.prisma.quotation.findUnique({
      where: { id },
      include: { stage: true },
    });

    if (!quotation || quotation.deletedAt) {
      throw new NotFoundException('Cotización no encontrada');
    }

    const client = await this.resolveQuotationClient(dto);
    const pricing = await this.buildPricingPayload(dto);
    const {
      itemRows,
      specialConsiderationRows,
      subtotal,
      finalChargeRate,
      tax,
      total,
      currency,
      discountPercent,
      requiresApproval,
      approvalStatus,
      pricingRuleLabel,
    } = pricing;
    const commercialSections =
      dto.commercialSections?.length
        ? this.normalizeCommercialSections(dto.commercialSections)
        : await this.resolveCommercialSectionsFromTemplate(dto);
    const commercialSectionsJson = this.toJsonSections(commercialSections);
    const requestedOwner =
      dto.createdById
        ? await this.prisma.user.findFirst({
            where: {
              id: dto.createdById,
              isActive: true,
              role: {
                in: [UserRole.ADMIN, UserRole.SALES],
              },
            },
          })
        : null;

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.quotationItem.deleteMany({
        where: { quotationId: id },
      });

      await tx.quotationSpecialConsideration.deleteMany({
        where: { quotationId: id },
      });

      const updated = await tx.quotation.update({
        where: { id },
        data: {
          clientId: client.id,
          contactName: dto.contactName?.trim() || null,
          serviceType: dto.serviceType?.trim() || null,
          templateType: dto.templateType?.trim() || null,
          coverTitle: dto.coverTitle?.trim() || dto.title,
          executiveSummary: dto.executiveSummary?.trim() || null,
          validUntil: this.resolveValidUntil(dto.validityDays),
          pricingRule: dto.pricingRule?.trim() || null,
          pricingRuleLabel,
          partCount: Math.max(0, dto.partCount ?? 0),
          discountPercent,
          requiresApproval,
          approvalStatus,
          approvalReason: requiresApproval ? 'Descuento superior al umbral configurado.' : null,
          approvalResolvedAt: requiresApproval ? null : quotation.approvalResolvedAt,
          approvedById: requiresApproval ? null : quotation.approvedById,
          title: dto.title,
          notes: dto.notes,
          durationOfWork: dto.durationOfWork,
          termsAndConditions: dto.termsAndConditions,
          commercialSections: commercialSectionsJson,
          currency,
          finalChargeRate,
          createdById: requestedOwner?.id || quotation.createdById,
          subtotal,
          tax,
          total,
          items: {
            create: itemRows,
          },
          specialConsiderations: {
            create: specialConsiderationRows,
          },
          activities: {
            create: {
              type: ActivityType.EDIT,
              description: 'Se actualizó la cotización completa desde el pipeline de cotización',
              userId: actorUserId,
            },
          },
          history: {
            create: {
              eventType: 'QUOTATION_REBUILT',
              fromStatus: quotation.status,
              toStatus: quotation.status,
              payload: {
                items: itemRows.length,
                total,
                currency,
                validUntil: this.resolveValidUntil(dto.validityDays),
                pricingRuleLabel,
              },
            },
          },
        },
        include: {
          client: true,
          items: true,
          specialConsiderations: {
            orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
          },
          stage: true,
          activities: true,
          createdBy: true,
        },
      });

      return updated;
    });

    await this.syncSpecialConsiderationCatalog(specialConsiderationRows);
    await this.syncServiceTemplate(dto);
    await this.syncWorkItemCatalog(commercialSections);
    await this.recordQuotationLearning(updated);

    return updated;
  }

  async changeStatus(id: string, status: QuotationStatus, actorUserId?: string) {
    const current = await this.prisma.quotation.findUnique({
      where: { id },
      include: { stage: true },
    });
    if (!current) {
      throw new NotFoundException('Cotización no encontrada');
    }

    try {
      await this.pipelineService.validateStageTransition(current.status, status);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Movimiento de pipeline inválido',
      );
    }

    const nextStage = await this.pipelineService.getStageByStatus(status);

    const updated = await this.prisma.quotation.update({
      where: { id },
      data: {
        status,
        stageId: nextStage?.id,
        history: {
          create: {
            eventType: 'QUOTATION_STATUS_CHANGED',
            fromStatus: current.status,
            toStatus: status,
          },
        },
        activities: {
          create: {
            type: ActivityType.STAGE_CHANGE,
            description: `Stage actualizado de ${current.stage?.name || current.status} a ${nextStage?.name || status}`,
            userId: actorUserId,
            payload: {
              fromStatus: current.status,
              toStatus: status,
            },
          },
        },
      },
    });

    if (status === QuotationStatus.ACEPTADA) {
      const acceptanceReport = await this.generateAcceptanceWordReport(id, actorUserId);
      return {
        ...updated,
        acceptanceReport,
      };
    }

    return updated;
  }

  async updateQuotation(id: string, dto: UpdateQuotationDto, actorUserId?: string) {
    const quotation = await this.prisma.quotation.findUnique({
      where: { id },
    });

    if (!quotation) {
      throw new NotFoundException('Cotización no encontrada');
    }

    if (dto.clientId) {
      const client = await this.prisma.client.findUnique({ where: { id: dto.clientId } });
      if (!client) {
        throw new NotFoundException('Cliente no encontrado');
      }
    }

    const updated = await this.prisma.quotation.update({
      where: { id },
      data: {
        clientId: dto.clientId,
        contactName:
          dto.contactName === undefined
            ? undefined
            : dto.contactName.trim() || null,
        coverTitle: dto.coverTitle,
        executiveSummary: dto.executiveSummary,
        serviceType: dto.serviceType,
        templateType: dto.templateType,
        pricingRule: dto.pricingRule,
        partCount: dto.partCount,
        validUntil:
          typeof dto.validityDays === 'number'
            ? this.resolveValidUntil(dto.validityDays)
            : undefined,
        title: dto.title,
        notes: dto.notes,
        activities: {
          create: {
            type: ActivityType.EDIT,
            description: 'Se actualizaron datos generales de la cotización',
            userId: actorUserId,
          },
        },
        history: {
          create: {
            eventType: 'QUOTATION_UPDATED',
            payload: {
              clientId: dto.clientId,
              contactName: dto.contactName,
              coverTitle: dto.coverTitle,
              executiveSummary: dto.executiveSummary,
              serviceType: dto.serviceType,
              templateType: dto.templateType,
              pricingRule: dto.pricingRule,
              partCount: dto.partCount,
              title: dto.title,
              notes: dto.notes,
            },
          },
        },
      },
      include: { client: true, items: true, stage: true, activities: true },
    });

    await this.recordQuotationLearning(updated);
    return updated;
  }

  async updateCommercialTerms(id: string, dto: UpdateQuotationCommercialDto, actorUserId?: string) {
    const current = await this.prisma.quotation.findUnique({ where: { id } });
    if (!current) {
      throw new NotFoundException('Cotización no encontrada');
    }

    return this.prisma.quotation.update({
      where: { id },
      data: {
        executiveSummary: dto.executiveSummary,
        coverTitle: dto.coverTitle,
        serviceType: dto.serviceType,
        templateType: dto.templateType,
        pricingRule: dto.pricingRule,
        validUntil:
          typeof dto.validityDays === 'number'
            ? this.resolveValidUntil(dto.validityDays)
            : undefined,
        durationOfWork: dto.durationOfWork,
        termsAndConditions: dto.termsAndConditions,
        commercialSections: dto.commercialSections
          ? this.toJsonSections(this.normalizeCommercialSections(dto.commercialSections))
          : undefined,
        history: {
          create: {
            eventType: 'QUOTATION_COMMERCIAL_UPDATED',
            payload: {
              durationOfWork: dto.durationOfWork,
              termsAndConditions: dto.termsAndConditions,
              executiveSummary: dto.executiveSummary,
              coverTitle: dto.coverTitle,
              serviceType: dto.serviceType,
              templateType: dto.templateType,
              pricingRule: dto.pricingRule,
              commercialSections: dto.commercialSections
                ? this.toJsonSections(this.normalizeCommercialSections(dto.commercialSections))
                : undefined,
            },
          },
        },
        activities: {
          create: {
            type: ActivityType.EDIT,
            description: 'Se actualizaron duración de trabajos y términos comerciales',
            userId: actorUserId,
          },
        },
      },
    });
  }

  async deleteQuotation(id: string) {
    const quotation = await this.prisma.quotation.findUnique({ where: { id } });

    if (!quotation || quotation.deletedAt) {
      throw new NotFoundException('Cotización no encontrada');
    }

    return this.prisma.quotation.update({
      where: { id },
      data: {
        deletedAt: new Date(),
      },
    });
  }

  async generatePdf(id: string, actorUserId?: string) {
    const quotation = await this.prisma.quotation.findUnique({
      where: { id },
      include: { client: true, items: true, createdBy: true },
    });

    if (!quotation) {
      throw new NotFoundException('Cotización no encontrada');
    }

    const pdf = await this.pdfService.renderQuotationPdf({
      folio: quotation.folio,
      issueDate: this.formatPdfDate(quotation.createdAt),
      validUntil: this.formatPdfDate(
        quotation.validUntil || new Date(quotation.createdAt.getTime() + 30 * 24 * 60 * 60 * 1000),
      ),
      client: {
        legalName: quotation.client.legalName,
        contactName: quotation.contactName || undefined,
        rfc: quotation.client.rfc || undefined,
        address: quotation.client.address || undefined,
      },
      quotation: {
        title: quotation.coverTitle || quotation.title,
        sellerName: this.normalizeOwnerName(quotation.createdBy.name, quotation.createdBy.email),
        notes: quotation.notes || undefined,
        durationOfWork: quotation.durationOfWork || undefined,
        termsAndConditions: quotation.termsAndConditions || undefined,
        executiveSummary: quotation.executiveSummary || undefined,
        commercialSections: Array.isArray(quotation.commercialSections)
          ? this.normalizeCommercialSections(
              quotation.commercialSections as Array<{ title: string; content: string }>,
            )
          : undefined,
        subtotal: quotation.subtotal.toString(),
        finalChargeRate: quotation.finalChargeRate.toString(),
        tax: quotation.tax.toString(),
        total: quotation.total.toString(),
        currency: quotation.currency,
      },
      items: quotation.items.map((item) => ({
        partNumber: item.partNumber,
        partQuantity: item.partQuantity,
        serviceCode: item.supplyCode,
        serviceName: item.supplyName,
        quantity: item.quantity.toString(),
        unitPrice: item.unitPrice.toString(),
        totalPrice: item.totalPrice.toString(),
      })),
    });

    await this.prisma.activity.create({
      data: {
        quotationId: quotation.id,
        type: ActivityType.PDF_SENT,
        description: 'PDF regenerado desde el panel comercial',
        userId: actorUserId,
        payload: {
          fileName: `${quotation.folio}.pdf`,
        },
      },
    });

    return {
      fileName: `${quotation.folio}.pdf`,
      file: Buffer.from(pdf).toString('base64'),
    };
  }

  async generateSimplifiedPdf(id: string, actorUserId?: string) {
    const quotation = await this.prisma.quotation.findUnique({
      where: { id },
      include: { client: true, items: true, createdBy: true },
    });

    if (!quotation) {
      throw new NotFoundException('Cotización no encontrada');
    }

    const pdf = await this.pdfService.renderSimplifiedQuotationPdf({
      folio: quotation.folio,
      issueDate: this.formatPdfDate(quotation.createdAt),
      validUntil: this.formatPdfDate(
        quotation.validUntil || new Date(quotation.createdAt.getTime() + 30 * 24 * 60 * 60 * 1000),
      ),
      client: {
        legalName: quotation.client.legalName,
        contactName: quotation.contactName || undefined,
        rfc: quotation.client.rfc || undefined,
        address: quotation.client.address || undefined,
      },
      quotation: {
        title: quotation.coverTitle || quotation.title,
        sellerName: this.normalizeOwnerName(quotation.createdBy.name, quotation.createdBy.email),
        notes: quotation.notes || undefined,
        durationOfWork: quotation.durationOfWork || undefined,
        termsAndConditions: quotation.termsAndConditions || undefined,
        executiveSummary: quotation.executiveSummary || undefined,
        commercialSections: Array.isArray(quotation.commercialSections)
          ? this.normalizeCommercialSections(
              quotation.commercialSections as Array<{ title: string; content: string }>,
            )
          : undefined,
        subtotal: quotation.subtotal.toString(),
        finalChargeRate: quotation.finalChargeRate.toString(),
        tax: quotation.tax.toString(),
        total: quotation.total.toString(),
        currency: quotation.currency,
      },
      items: quotation.items.map((item) => ({
        partNumber: item.partNumber,
        partQuantity: item.partQuantity,
        serviceCode: item.supplyCode,
        serviceName: item.supplyName,
        quantity: item.quantity.toString(),
        unitPrice: item.unitPrice.toString(),
        totalPrice: item.totalPrice.toString(),
      })),
    });

    await this.prisma.activity.create({
      data: {
        quotationId: quotation.id,
        type: ActivityType.PDF_SENT,
        description: 'PDF simplificado regenerado desde el panel comercial',
        userId: actorUserId,
        payload: {
          fileName: `${quotation.folio}-simplificado.pdf`,
        },
      },
    });

    return {
      fileName: `${quotation.folio}-simplificado.pdf`,
      file: Buffer.from(pdf).toString('base64'),
    };
  }

  async generateWordReport(id: string, actorUserId?: string) {
    return this.reporteWordService.generarCotizacionWord(id, actorUserId);
  }

  async generateSuggestedWordReport(id: string, actorUserId?: string) {
    return this.reporteWordService.generarReporteSugeridoWord(id, actorUserId);
  }

  listActivities(id: string) {
    return this.prisma.activity.findMany({
      where: { quotationId: id },
      include: { user: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createActivity(id: string, dto: CreateQuotationActivityDto, actorUserId?: string) {
    const quotation = await this.prisma.quotation.findUnique({ where: { id } });
    if (!quotation) {
      throw new NotFoundException('Cotización no encontrada');
    }

    return this.prisma.activity.create({
      data: {
        quotationId: id,
        type: dto.type || ActivityType.NOTE,
        description: dto.description,
        userId: actorUserId,
      },
    });
  }

  async duplicateQuotation(id: string, actorUserId?: string) {
    const quotation = await this.prisma.quotation.findUnique({
      where: { id },
      include: {
        items: true,
        specialConsiderations: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
      },
    });

    if (!quotation || quotation.deletedAt) {
      throw new NotFoundException('Cotización no encontrada');
    }

    const pipeline = await this.pipelineService.ensureDefaultPipeline();
    const draftStage = pipeline?.stages.find((stage) => stage.code === QuotationStatus.BORRADOR);
    const rootId = quotation.rootQuotationId || quotation.id;

    return this.createQuotationWithResolvedFolio((folio) =>
      this.prisma.quotation.create({
        data: {
          folio,
          rootQuotationId: rootId,
          previousVersionId: quotation.id,
          clientId: quotation.clientId,
          contactName: quotation.contactName,
          pipelineId: pipeline?.id,
          stageId: draftStage?.id,
          status: QuotationStatus.BORRADOR,
          serviceType: quotation.serviceType,
          templateType: quotation.templateType,
          coverTitle: quotation.coverTitle,
          executiveSummary: quotation.executiveSummary,
          versionNumber: quotation.versionNumber + 1,
          validUntil: quotation.validUntil,
          pricingRule: quotation.pricingRule,
          pricingRuleLabel: quotation.pricingRuleLabel,
          discountPercent: quotation.discountPercent,
          requiresApproval: quotation.requiresApproval,
          approvalStatus: quotation.approvalStatus,
          approvalReason: quotation.approvalReason,
        title: `${quotation.title} v${quotation.versionNumber + 1}`,
        notes: quotation.notes,
        durationOfWork: quotation.durationOfWork,
        termsAndConditions: quotation.termsAndConditions,
        commercialSections: quotation.commercialSections as Prisma.InputJsonValue,
        subtotal: quotation.subtotal,
        finalChargeRate: quotation.finalChargeRate,
        tax: quotation.tax,
        total: quotation.total,
        currency: quotation.currency,
        partCount: quotation.partCount,
        createdById: actorUserId || quotation.createdById,
        items: {
          create: quotation.items.map((item) => ({
            supplyId: item.supplyId || undefined,
            pricingProfileId: item.pricingProfileId || undefined,
            supplyCode: item.supplyCode,
            supplyName: item.supplyName,
            categoryName: item.categoryName,
            pricingProfileName: item.pricingProfileName,
            partNumber: item.partNumber,
            partQuantity: item.partQuantity,
            activityDays: item.activityDays,
            isOptional: item.isOptional,
            optionGroup: item.optionGroup,
            optionLabel: item.optionLabel,
            quantity: Number(item.quantity),
            unitPrice: Number(item.unitPrice),
            totalPrice: Number(item.totalPrice),
            exchangeRateUsed: item.exchangeRateUsed ? Number(item.exchangeRateUsed) : undefined,
            priceOriginCurrency: item.priceOriginCurrency || undefined,
            priceVersionId: item.priceVersionId || undefined,
          })),
        },
        specialConsiderations: {
          create: quotation.specialConsiderations.map((item) => ({
            type: item.type,
            concept: item.concept || undefined,
            quantity: item.quantity,
            percentage: item.percentage ? Number(item.percentage) : undefined,
            location: item.location || undefined,
            mxnAmount: item.mxnAmount ? Number(item.mxnAmount) : undefined,
            usdAmount: item.usdAmount ? Number(item.usdAmount) : undefined,
            sortOrder: item.sortOrder,
          })),
        },
        activities: {
          create: {
            type: ActivityType.EDIT,
            description: `Se creó la versión ${quotation.versionNumber + 1} desde ${quotation.folio}`,
            userId: actorUserId,
          },
        },
      },
    }));
  }

  async markQuotationInteraction(
    id: string,
    action: 'sent' | 'viewed' | 'accepted' | 'rejected',
    actorUserId?: string,
  ) {
    const current = await this.prisma.quotation.findUnique({
      where: { id },
    });

    if (!current || current.deletedAt) {
      throw new NotFoundException('Cotización no encontrada');
    }

    const now = new Date();
    const interactionMap = {
      sent: {
        status: QuotationStatus.ENVIADA,
        field: 'sentAt',
        description: 'Cotización marcada como enviada',
      },
      viewed: {
        status: QuotationStatus.VISTA,
        field: 'viewedAt',
        description: 'Cotización marcada como vista por el cliente',
      },
      accepted: {
        status: QuotationStatus.ACEPTADA,
        field: 'acceptedAt',
        description: 'Cotización marcada como aceptada',
      },
      rejected: {
        status: QuotationStatus.RECHAZADA,
        field: 'rejectedAt',
        description: 'Cotización marcada como rechazada',
      },
    } as const;

    const interaction = interactionMap[action];
    const nextStage = await this.pipelineService.getStageByStatus(interaction.status);

    const updated = await this.prisma.quotation.update({
      where: { id },
      data: {
        status: interaction.status,
        stageId: nextStage?.id,
        [interaction.field]: now,
        history: {
          create: {
            eventType: 'QUOTATION_INTERACTION_MARKED',
            fromStatus: current.status,
            toStatus: interaction.status,
            payload: { action, at: now.toISOString() },
          },
        },
        activities: {
          create: {
            type: action === 'sent' ? ActivityType.PDF_SENT : ActivityType.EDIT,
            description: interaction.description,
            userId: actorUserId,
          },
        },
      },
    });

    if (action === 'accepted') {
      const acceptanceReport = await this.generateAcceptanceWordReport(id, actorUserId);
      return {
        ...updated,
        acceptanceReport,
      };
    }

    return updated;
  }

  async resolveQuotationApproval(
    id: string,
    status: 'APPROVED' | 'REJECTED',
    actorUserId?: string,
  ) {
    const current = await this.prisma.quotation.findUnique({ where: { id } });
    if (!current || current.deletedAt) {
      throw new NotFoundException('Cotización no encontrada');
    }

    return this.prisma.quotation.update({
      where: { id },
      data: {
        approvalStatus: status,
        approvedById: actorUserId,
        approvalResolvedAt: new Date(),
        history: {
          create: {
            eventType: 'QUOTATION_APPROVAL_UPDATED',
            payload: { approvalStatus: status },
          },
        },
        activities: {
          create: {
            type: ActivityType.EDIT,
            description: status === ApprovalStatus.APPROVED ? 'Descuento aprobado' : 'Descuento rechazado',
            userId: actorUserId,
          },
        },
      },
    });
  }

  async convertQuotationToWorkOrder(id: string, actorUserId?: string) {
    const current = await this.prisma.quotation.findUnique({ where: { id } });
    if (!current || current.deletedAt) {
      throw new NotFoundException('Cotización no encontrada');
    }

    const nextStage = await this.pipelineService.getStageByStatus(QuotationStatus.EJECUTADA);
    const workOrderNumber = current.workOrderNumber || `OT-${current.folio.replace('COT.', '')}`;

    return this.prisma.quotation.update({
      where: { id },
      data: {
        status: QuotationStatus.EJECUTADA,
        stageId: nextStage?.id,
        convertedToWorkOrderAt: new Date(),
        workOrderNumber,
        activities: {
          create: {
            type: ActivityType.EDIT,
            description: `Cotización convertida a orden de trabajo ${workOrderNumber}`,
            userId: actorUserId,
          },
        },
        history: {
          create: {
            eventType: 'QUOTATION_CONVERTED_TO_WORK_ORDER',
            fromStatus: current.status,
            toStatus: QuotationStatus.EJECUTADA,
            payload: { workOrderNumber },
          },
        },
      },
    });
  }

  private async ensureSystemUser() {
    const user = await this.prisma.user.create({
      data: {
        name: 'System Admin',
        email: 'admin@local.dev',
        passwordHash: 'bootstrap',
        role: 'ADMIN',
      },
    });
    return user.id;
  }

  private async requireClient(clientId: string) {
    const client = await this.prisma.client.findUnique({ where: { id: clientId } });

    if (!client) {
      throw new NotFoundException('Cliente no encontrado');
    }

    return client;
  }

  private async resolveQuotationClient(dto: Pick<CreateQuotationDto, 'clientId' | 'clientName'>) {
    if (dto.clientId) {
      return this.requireClient(dto.clientId);
    }

    const legalName = dto.clientName?.trim();
    if (!legalName) {
      throw new BadRequestException('El nombre de la compañía es obligatorio.');
    }

    const existing = await this.prisma.client.findFirst({
      where: {
        legalName: {
          equals: legalName,
          mode: 'insensitive',
        },
        deletedAt: null,
      },
    });

    if (existing) {
      return existing;
    }

    return this.prisma.client.create({
      data: {
        legalName,
        commercialName: null,
        rfc: null,
        address: null,
      },
    });
  }

  private async buildPricingPayload(dto: CreateQuotationDto) {
    const supplies = await this.prisma.supply.findMany({
      where: { id: { in: dto.items.map((item) => item.serviceId).filter(Boolean) as string[] } },
      include: { category: true },
    });
    const pricingProfiles = await this.prisma.supplyPricingProfile.findMany({
      where: { id: { in: dto.items.map((item) => item.pricingProfileId).filter(Boolean) as string[] } },
    });

    const itemRows: Array<{
      supplyId?: string;
      pricingProfileId?: string;
      supplyCode: string;
      supplyName: string;
      categoryName: string;
      pricingProfileName: string;
      partNumber: number;
      partQuantity: number;
      activityDays: number;
      isOptional?: boolean;
      optionGroup?: string;
      optionLabel?: string;
      quantity: number;
      unitPrice: number;
      totalPrice: number;
      exchangeRateUsed?: number;
      priceOriginCurrency?: string;
      priceVersionId?: string;
    }> = [];
    const specialConsiderationRows: Array<{
      type: SpecialConsiderationType;
      concept?: string;
      quantity?: number;
      percentage?: number;
      location?: string;
      mxnAmount?: number;
      usdAmount?: number;
      sortOrder: number;
    }> = [];
    let subtotal = 0;
    const currency = dto.currency || 'MXN';
    const configuredExchangeRate = await this.catalogService.getExchangeRate();
    const exchangeRate = dto.exchangeRate || Number(configuredExchangeRate.rate);
    const pricingRule = this.resolvePricingRule(dto.pricingRule);
    let catalogTotal = 0;

    for (const item of dto.items) {
      if (!item.serviceId || !item.pricingProfileId) {
        const manualName = item.name?.trim();
        const manualCode = item.code?.trim() || 'ACTIVIDAD';
        const manualCategory = item.categoryName?.trim() || 'Actividades';
        const manualProfileName = item.pricingProfileName?.trim() || 'Manual';

        if (!manualName) {
          throw new BadRequestException('Los conceptos manuales requieren al menos un nombre.');
        }

        const quantity = item.quantity;
        const partNumber = Math.max(0, item.partNumber ?? 0);
        const partQuantity = partNumber > 0 ? Math.max(1, item.partQuantity || 1) : 1;
        const unitPrice = Number(item.unitPriceOverride || 0);
        const activityDays = Math.max(1, item.activityDays || 1);
        const totalPrice = Number((unitPrice * quantity * activityDays * partQuantity).toFixed(2));

        subtotal += item.isOptional ? 0 : totalPrice;
        itemRows.push({
          supplyCode: manualCode,
          supplyName: manualName,
          categoryName: manualCategory,
          pricingProfileName: manualProfileName,
          partNumber,
          partQuantity,
          activityDays,
          isOptional: item.isOptional,
          optionGroup: item.optionGroup?.trim() || undefined,
          optionLabel: item.optionLabel?.trim() || undefined,
          quantity,
          unitPrice,
          totalPrice,
          exchangeRateUsed: exchangeRate,
          priceOriginCurrency: currency,
        });
        continue;
      }

      let supply = supplies.find((current) => current.id === item.serviceId);
      let pricingProfile = pricingProfiles.find(
        (current) =>
          current.id === item.pricingProfileId && current.supplyId === item.serviceId,
      );

      if (!supply) {
        throw new NotFoundException(`Servicio ${item.serviceId} no encontrado`);
      }

      const requestedName = item.name?.trim();
      const requestedCode = item.code?.trim().toUpperCase();
      if (
        supply.code.startsWith('ACT-') &&
        (
          (requestedName &&
            requestedName.localeCompare(supply.name, 'es', { sensitivity: 'base' }) !== 0) ||
          (requestedCode && requestedCode !== supply.code)
        )
      ) {
        const ensuredActivity = await this.catalogService.ensureActivityConcept({
          name: requestedName || supply.name,
          code: requestedCode,
          unitPrice:
            typeof item.unitPriceOverride === 'number' && item.unitPriceOverride >= 0
              ? item.unitPriceOverride
              : undefined,
        });
        supply = ensuredActivity.supply;
        pricingProfile = ensuredActivity.pricingProfile;
      }

      if (!pricingProfile) {
        throw new NotFoundException(
          `Perfil de precio ${item.pricingProfileId} no encontrado para ${supply.code}`,
        );
      }

      const quantity = item.quantity;
      const partNumber = Math.max(0, item.partNumber ?? 0);
      const partQuantity = partNumber > 0 ? Math.max(1, item.partQuantity || 1) : 1;
      const activityDays =
        supply.code.startsWith('ACT-')
          ? Math.max(1, item.activityDays || 1)
          : 1;
      const hasMxnPrice = pricingProfile.mxnPrice !== null;
      const hasUsdPrice = pricingProfile.usdPrice !== null;
      const mxnPrice = hasMxnPrice ? Number(pricingProfile.mxnPrice) : 0;
      const usdPrice = hasUsdPrice ? Number(pricingProfile.usdPrice) : 0;
      let catalogUnitPrice = 0;
      let priceOriginCurrency = currency;

      if (currency === 'USD') {
        if (hasUsdPrice) {
          catalogUnitPrice = usdPrice;
          priceOriginCurrency = 'USD';
        } else if (hasMxnPrice && exchangeRate) {
          catalogUnitPrice = Number((mxnPrice / exchangeRate).toFixed(2));
          priceOriginCurrency = 'MXN';
        }
      } else if (hasMxnPrice) {
        catalogUnitPrice = mxnPrice;
        priceOriginCurrency = 'MXN';
      } else if (hasUsdPrice && exchangeRate) {
        catalogUnitPrice = Number((usdPrice * exchangeRate).toFixed(2));
        priceOriginCurrency = 'USD';
      }

      if (!hasMxnPrice && !hasUsdPrice) {
        throw new NotFoundException(
          `Suministro ${supply.code} sin precio configurado en ${currency}`,
        );
      }

      const unitPrice =
        typeof item.unitPriceOverride === 'number' && item.unitPriceOverride >= 0
          ? item.unitPriceOverride
          : Number((catalogUnitPrice * pricingRule.multiplier).toFixed(2));

      const totalPrice = unitPrice * quantity * activityDays * partQuantity;
      const catalogTotalPrice = Number((catalogUnitPrice * quantity * activityDays * partQuantity).toFixed(2));
      catalogTotal += catalogTotalPrice;
      subtotal += item.isOptional ? 0 : totalPrice;

      itemRows.push({
        supplyId: supply.id,
        pricingProfileId: pricingProfile.id,
        supplyCode: item.code?.trim() || supply.code,
        supplyName: item.name?.trim() || supply.name,
        categoryName: supply.category.name,
        pricingProfileName: pricingProfile.name,
        partNumber,
        partQuantity,
        activityDays,
        isOptional: item.isOptional,
        optionGroup: item.optionGroup?.trim() || undefined,
        optionLabel: item.optionLabel?.trim() || undefined,
        quantity,
        unitPrice,
        totalPrice,
        exchangeRateUsed: exchangeRate,
        priceOriginCurrency,
      });
    }

    const specialConsiderations = dto.specialConsiderations || [];
    const baseServiceSubtotal = subtotal;
    for (const [index, consideration] of specialConsiderations.entries()) {
      if (consideration.type === SpecialConsiderationType.PERCENTAGE) {
        const percentage = consideration.percentage || 0;
        const concept = consideration.concept?.trim() || undefined;
        const quantity = consideration.quantity || 1;

        if (percentage) {
          const additionalAmount = baseServiceSubtotal * (percentage / 100);
          subtotal += additionalAmount;
          specialConsiderationRows.push({
            type: SpecialConsiderationType.PERCENTAGE,
            concept,
            quantity,
            percentage,
            sortOrder: consideration.sortOrder ?? index,
          });
          continue;
        }

        const mxnAmount = consideration.mxnAmount || 0;
        const usdAmount = consideration.usdAmount || 0;
        let appliedAmount = 0;

        if (currency === 'USD') {
          appliedAmount = usdAmount || (mxnAmount && exchangeRate ? mxnAmount / exchangeRate : 0);
        } else {
          appliedAmount = mxnAmount || (usdAmount && exchangeRate ? usdAmount * exchangeRate : 0);
        }

        appliedAmount *= quantity;

        if (!appliedAmount) {
          continue;
        }

        subtotal += appliedAmount;
        specialConsiderationRows.push({
          type: SpecialConsiderationType.PERCENTAGE,
          concept,
          quantity,
          mxnAmount: mxnAmount || undefined,
          usdAmount: usdAmount || undefined,
          sortOrder: consideration.sortOrder ?? index,
        });
        continue;
      }

      const mxnAmount = consideration.mxnAmount || 0;
      const usdAmount = consideration.usdAmount || 0;
      let appliedAmount = 0;

      if (currency === 'USD') {
        appliedAmount = usdAmount || (mxnAmount && exchangeRate ? mxnAmount / exchangeRate : 0);
      } else {
        appliedAmount = mxnAmount || (usdAmount && exchangeRate ? usdAmount * exchangeRate : 0);
      }

      if (!appliedAmount) {
        continue;
      }

      subtotal += appliedAmount;
      specialConsiderationRows.push({
        type: SpecialConsiderationType.TRAVEL,
        location: consideration.location?.trim() || undefined,
        quantity: 1,
        mxnAmount: mxnAmount || undefined,
        usdAmount: usdAmount || undefined,
        sortOrder: consideration.sortOrder ?? index,
      });
    }

    const finalChargeRate = Number((dto.finalChargeRate ?? 16).toFixed(4));
    const tax = Number((subtotal * (finalChargeRate / 100)).toFixed(2));
    const total = Number((subtotal + tax).toFixed(2));
    const discountPercent = catalogTotal
      ? Number((((catalogTotal - subtotal) / catalogTotal) * 100).toFixed(2))
      : 0;
    const requiresApproval = discountPercent > 10;

    return {
      itemRows,
      specialConsiderationRows,
      subtotal,
      finalChargeRate,
      tax,
      total,
      currency,
      exchangeRate,
      discountPercent,
      requiresApproval,
      approvalStatus: requiresApproval ? ApprovalStatus.PENDING : ApprovalStatus.NOT_REQUIRED,
      pricingRuleLabel: pricingRule.label,
    };
  }

  private formatPdfDate(date: Date) {
    return date.toISOString().slice(0, 10);
  }

  private async resolveCommercialSectionsFromTemplate(dto: CreateQuotationDto) {
    const template = await this.getCommercialTemplate();
    const storedSections = Array.isArray(template.sections)
      ? this.normalizeCommercialSections(
          template.sections as Array<{ title: string; content: string }>,
        )
      : await this.defaultCommercialSections();

    if (!storedSections.length) {
      return this.defaultCommercialSections();
    }

    const reusableBlocks = dto.reusableBlockIds?.length
      ? await this.prisma.reusableTextBlock.findMany({
          where: {
            id: { in: dto.reusableBlockIds },
            deletedAt: null,
          },
          orderBy: [{ type: 'asc' }, { name: 'asc' }],
        })
      : [];

    const sections = storedSections.map((section) => {
      if (section.title === 'Duracion de los trabajos:' && dto.durationOfWork) {
        return { ...section, content: dto.durationOfWork };
      }

      if (section.title === 'Notas importantes:' && dto.notes) {
        return { ...section, content: dto.notes };
      }

      if (section.title === 'CONDICIONES DE PAGO:' && dto.termsAndConditions) {
        return { ...section, content: dto.termsAndConditions };
      }

      return section;
    });

    return [
      ...sections,
      ...reusableBlocks.map((block) => ({
        title: `${block.type}: ${block.name}`,
        content: block.content,
      })),
    ];
  }

  private async defaultCommercialSections() {
    const company = await this.companyProfileService.getProfile().catch(() => null);
    const issuerName = company?.legalName || 'SISTEMAS ELECTRICOS ZARAGOZA S. A DE C. V. (SIEZA)';
    const shortName = company?.brandShortName || company?.commercialName || 'SIEZA';

    return [
      {
        title: 'Trabajos a realizar:',
        content: '',
      },
      {
        title: 'Duracion de los trabajos:',
        content:
          company?.defaultDurationOfWork?.trim() ||
          `Una vez autorizado este presupuesto y colocada la orden por escrito a ${issuerName}, el tiempo de realización es de:\nEl tiempo estimado es de 6 días en sitio, dependiendo de las facilidades de las instalaciones`,
      },
      {
        title: 'Notas importantes:',
        content:
          company?.defaultTerms?.trim() ||
          `-La presente representa nuestra interpretación a sus requerimientos sobre la base de la información que nos proporcionaron y el alcance de suministro se limita a lo descrito en la\npresente oferta, cualquier desviación o equipo adicional, requerirá de una negociación del precio y tiempo de entrega cotizados.\n-No se contempla la reparación ni el refaccionamiento de ningún tipo, de ser necesario será cotizado por separado.\n-Se requiere de una orden de compra y el anticipo correspondiente previo al inicio de los trabajos.\n-Se consideran los viáticos del personal para este servicio, incluyendo la entrega de reportes de campo.\n-Nuestros equipos de pruebas cuentan con Protocolo de pruebas de laboratorio certificado, se entrega copia conjuntamente con los reportes.\n-Confirmar con al menos 5 días de anticipación\n-Todo atraso no imputable a ${shortName} se cobrará a razón de $15,000.00 pesos por día. Por el grupo de personal considerado (1 Ingeniero y 1 Técnico)\n-Se entregará copia de los reportes de campo al concluir el servicio, y una semana después, se enviará la carpeta con todos los reportes, incluyendo el fotográfico.`,
      },
      {
        title: 'Precios y validez:',
        content: 'Los precios tienen una validez de 30 días.',
      },
      {
        title: 'CONDICIONES DE PAGO:',
        content: '100 % a 90 días después de concluir el servicio.',
      },
    ];
  }

  private async recordQuotationLearning(quotation: QuotationWithRelations) {
    try {
      const inputText = this.buildLearningInputText(quotation);
      if (!inputText) {
        await this.appendQuotationLearningLog(
          quotation,
          {
            inputText: '',
            category: quotation.serviceType || null,
            service: quotation.title,
            variables: this.buildLearningVariables(quotation, 0),
            suggestedServices: [],
            suggestedWorkItems: [],
            confidence: 0,
          },
          null,
          'skipped_empty_input',
        );
        return;
      }

      const suggestedServices = this.extractSuggestedServicesFromItems(quotation.items || []);
      if (!suggestedServices.length) {
        await this.appendQuotationLearningLog(
          quotation,
          {
            inputText,
            category: quotation.serviceType || null,
            service: quotation.title,
            variables: this.buildLearningVariables(quotation, 0),
            suggestedServices: [],
            suggestedWorkItems: [],
            confidence: 0.95,
          },
          null,
          'skipped_empty_services',
        );
        return;
      }

      const suggestedWorkItems = this.extractWorkItemsFromSections(quotation.commercialSections);
      const learningPayload = {
        inputText,
        category: quotation.serviceType || null,
        service: quotation.title,
        variables: this.buildLearningVariables(quotation, suggestedWorkItems.length),
        suggestedServices,
        suggestedWorkItems,
        confidence: 0.95,
      } as const;

      const learningResult = await this.aiLearningService.learnFromSuggestion(learningPayload);
      await this.appendQuotationLearningLog(quotation, learningPayload, learningResult, 'learned');
    } catch (error) {
      console.error('recordQuotationLearning failed:', error);
    }
  }

  private buildLearningInputText(quotation: QuotationWithRelations) {
    const segments = [
      quotation.coverTitle,
      quotation.title,
      quotation.serviceType,
      quotation.executiveSummary,
      typeof quotation.client?.legalName === 'string' ? quotation.client?.legalName : undefined,
    ];

    return segments.filter(Boolean).join(' · ').trim();
  }

  private buildLearningVariables(quotation: QuotationWithRelations, workItemsCount: number) {
    return {
      cliente: quotation.client?.legalName || 'Cliente',
      servicio: quotation.serviceType || quotation.title,
      items: (quotation.items || []).length,
      workItems: workItemsCount,
      subtotal: Number(quotation.subtotal),
      total: Number(quotation.total),
      currency: quotation.currency,
    };
  }

  private extractSuggestedServicesFromItems(items: QuotationItem[]) {
    return Array.from(
      new Set(
        items
          .filter((item) => !this.isDerivedSpecialConsiderationCode(item.supplyCode))
          .map((item) => item.supplyName?.trim())
          .filter((name): name is string => Boolean(name)),
      ),
    );
  }

  private isDerivedSpecialConsiderationCode(code?: string | null) {
    return ['ADICIONAL', 'VIATICOS'].includes(String(code || '').trim().toUpperCase());
  }

  private async appendQuotationLearningLog(
    quotation: QuotationWithRelations,
    input: {
      inputText: string;
      category: string | null;
      service: string | null;
      variables: Record<string, string | number>;
      suggestedServices: string[];
      suggestedWorkItems: string[];
      confidence: number;
    },
    output: {
      id?: string;
      mode?: string;
      normalizedInput?: string;
      detectedCategory?: string | null;
      detectedService?: string | null;
      suggestedServices?: unknown;
      suggestedWorkItems?: unknown;
      variables?: unknown;
      confidence?: number;
      createdAt?: Date;
      updatedAt?: Date;
    } | null,
    status: 'learned' | 'skipped_empty_input' | 'skipped_empty_services',
  ) {
    await this.aiLearningLogService.append('quotation-learning-log.jsonl', {
      loggedAt: new Date().toISOString(),
      source: 'quotation',
      status,
      quotation: {
        id: quotation.id,
        folio: quotation.folio,
        title: quotation.title,
        serviceType: quotation.serviceType || null,
        client: quotation.client?.legalName || null,
        currency: quotation.currency,
        subtotal: Number(quotation.subtotal),
        total: Number(quotation.total),
      },
      input,
      output:
        output
          ? {
              id: output.id || null,
              mode: output.mode || null,
              normalizedInput: output.normalizedInput || null,
              detectedCategory: output.detectedCategory || null,
              detectedService: output.detectedService || null,
              variables: output.variables ?? null,
              suggestedServices: output.suggestedServices ?? null,
              suggestedWorkItems: output.suggestedWorkItems ?? null,
              confidence: typeof output.confidence === 'number' ? output.confidence : null,
              createdAt: output.createdAt?.toISOString() || null,
              updatedAt: output.updatedAt?.toISOString() || null,
            }
          : null,
    });
  }

  private extractWorkItemsFromSections(value: Prisma.JsonValue | null) {
    const sections = this.parseCommercialSections(value).filter(
      (section) => !section.title.trim().startsWith('__'),
    );
    const lines = sections.flatMap((section) => [
      ...this.splitSectionLines(section.title),
      ...this.splitSectionLines(section.content),
    ]);

    return Array.from(new Set(lines));
  }

  private parseCommercialSections(
    value: Prisma.JsonValue | null,
  ): Array<{ title: string; content: string }> {
    if (!value) {
      return [];
    }

    let parsed: unknown = value;

    if (typeof value === 'string') {
      try {
        parsed = JSON.parse(value);
      } catch {
        return [];
      }
    }

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((section) => {
        if (!section || typeof section !== 'object') {
          return null;
        }

        return {
          title: typeof (section as Record<string, unknown>).title === 'string'
            ? (section as Record<string, unknown>).title
            : '',
          content: typeof (section as Record<string, unknown>).content === 'string'
            ? (section as Record<string, unknown>).content
            : '',
        };
      })
      .filter(
        (section): section is { title: string; content: string } =>
          Boolean(section && (section.title || section.content)),
      );
  }

  private splitSectionLines(value: string | null | undefined) {
    if (!value) {
      return [];
    }

    return value
      .replace(/•/g, '\n')
      .replace(/·/g, '\n')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  async learnQuotation(id: string) {
    const quotation = await this.prisma.quotation.findUnique({
      where: { id },
      include: {
        client: true,
        items: true,
      },
    });

    if (!quotation) {
      throw new NotFoundException('Cotización no encontrada');
    }

    await this.recordQuotationLearning({
      ...quotation,
      client: quotation.client,
      items: quotation.items,
    });

    return { learned: true };
  }

  async rebuildLearningFromQuotations() {
    await this.prisma.learnedRule.deleteMany({});
    const quotations = await this.prisma.quotation.findMany({
      where: { deletedAt: null },
      include: {
        client: true,
        items: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    for (const quotation of quotations) {
      await this.recordQuotationLearning({
        ...quotation,
        client: quotation.client,
        items: quotation.items,
      });
    }

    return { learned: quotations.length };
  }

  private async generateAcceptanceWordReport(id: string, actorUserId?: string) {
    try {
      return await this.reporteWordService.generarReporteSugeridoWord(id, actorUserId);
    } catch (error) {
      await this.prisma.activity.create({
        data: {
          quotationId: id,
          type: ActivityType.EDIT,
          description: 'No fue posible generar el reporte Word automático al aceptar la cotización',
          userId: actorUserId,
          payload: {
            error: error instanceof Error ? error.message : 'unknown_error',
          },
        },
      });

      return null;
    }
  }

  private normalizeCommercialSections(
    sections: Array<{ title: string; content: string }>,
  ) {
    const defaults = [
      { title: 'Trabajos a realizar:', content: '' },
      { title: 'Duracion de los trabajos:', content: '' },
      { title: 'Notas importantes:', content: '' },
      { title: 'Precios y validez:', content: 'Los precios tienen una validez de 30 días.' },
      { title: 'CONDICIONES DE PAGO:', content: '100 % a 90 días después de concluir el servicio.' },
    ];
    const byTitle = new Map(
      sections.map((section) => [this.normalizeSectionTitle(section.title), section] as const),
    );

    const orderedBase = defaults.map((defaultSection) => {
      const normalizedTitle = this.normalizeSectionTitle(defaultSection.title);
      const current = byTitle.get(normalizedTitle);

      return {
        title: current?.title || defaultSection.title,
        content: current?.content || defaultSection.content,
      };
    });

    const remaining = sections.filter((section) => {
      const normalizedTitle = this.normalizeSectionTitle(section.title);
      return !defaults.some(
        (defaultSection) =>
          this.normalizeSectionTitle(defaultSection.title) === normalizedTitle,
      );
    });

    return [...orderedBase, ...remaining];
  }

  private normalizeSectionTitle(title: string) {
    return title
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  private normalizeOwnerName(name: string, email?: string | null) {
    if (email === 'admin@local.dev' || name === 'System Admin') {
      return 'Juan Ramon Alvarez Echavarria';
    }

    return name;
  }

  private toJsonSections(
    sections: Array<{ title: string; content: string }>,
  ): Prisma.InputJsonValue {
    return sections.map((section) => ({
      title: section.title,
      content: section.content,
    })) as Prisma.InputJsonValue;
  }

  private async syncSpecialConsiderationCatalog(
    rows: Array<{
      type: SpecialConsiderationType;
      concept?: string;
      quantity?: number;
      percentage?: number;
      location?: string;
      mxnAmount?: number;
      usdAmount?: number;
      sortOrder: number;
    }>,
  ) {
    for (const row of rows) {
      if (row.type === SpecialConsiderationType.PERCENTAGE && row.concept) {
        await this.prisma.specialConsiderationCatalog.create({
          data: {
            type: row.type,
            concept: row.concept,
            quantity: row.quantity || 1,
            percentage: row.percentage,
            mxnAmount: row.mxnAmount,
            usdAmount: row.usdAmount,
          },
        });
        continue;
      }

      if (row.type === SpecialConsiderationType.TRAVEL && row.location) {
        await this.prisma.specialConsiderationCatalog.create({
          data: {
            type: row.type,
            location: row.location,
            quantity: 1,
            mxnAmount: row.mxnAmount,
            usdAmount: row.usdAmount,
          },
        });
      }
    }
  }

  private async syncServiceTemplate(dto: CreateQuotationDto) {
    const normalizedName = dto.title.trim();
    if (!normalizedName) {
      return;
    }

    const normalizedCommercialSections = dto.commercialSections?.length
      ? this.toJsonSections(this.normalizeCommercialSections(dto.commercialSections))
      : undefined;

    await this.prisma.serviceCatalog.upsert({
      where: { name: normalizedName },
      update: {
        templateType: dto.templateType?.trim() || null,
        items: dto.items as unknown as Prisma.InputJsonValue,
        commercialSections: normalizedCommercialSections,
        specialConsiderations: dto.specialConsiderations
          ? (dto.specialConsiderations as unknown as Prisma.InputJsonValue)
          : undefined,
        deletedAt: null,
      },
      create: {
        name: normalizedName,
        templateType: dto.templateType?.trim() || null,
        items: dto.items as unknown as Prisma.InputJsonValue,
        commercialSections: normalizedCommercialSections
          ? normalizedCommercialSections
          : Prisma.JsonNull,
        specialConsiderations: dto.specialConsiderations
          ? (dto.specialConsiderations as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
    });
  }

  private buildActivitySections(activityNames?: string[]) {
    const activities = (activityNames || []).map((item) => item.trim()).filter(Boolean);
    if (!activities.length) {
      return Prisma.JsonNull;
    }

    return [
      {
        title: 'Trabajos a realizar:',
        content: activities.join('\n'),
      },
    ];
  }

  private async syncWorkItemCatalog(
    sections: Array<{ title: string; content: string }>,
  ) {
    const workSection = sections.find(
      (section) => this.normalizeSectionTitle(section.title) === 'trabajos a realizar:',
    );

    if (!workSection?.content?.trim()) {
      return;
    }

    const rows = workSection.content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    for (const row of rows) {
      await this.prisma.activityCatalog.upsert({
        where: { name: row },
        update: { deletedAt: null },
        create: { name: row },
      });
    }

    await this.catalogService.syncActivityCatalogToConceptCategory();
  }

  private normalizeWorkItemName(value: string) {
    const normalized = value.trim().replace(/\s+/g, ' ');

    if (!normalized) {
      throw new BadRequestException('El nombre del trabajo es obligatorio.');
    }

    return normalized;
  }

  private normalizeReusableTextBlock(dto: CreateReusableTextBlockDto | UpdateReusableTextBlockDto) {
    const name = dto.name.trim();
    const type = dto.type.trim();
    const content = dto.content.trim();

    if (!name || !type || !content) {
      throw new BadRequestException('Nombre, tipo y contenido son obligatorios.');
    }

    return { name, type, content };
  }

  private resolvePricingRule(rule?: string | null) {
    const normalized = (rule || 'STANDARD').trim().toUpperCase();

    switch (normalized) {
      case 'URGENT':
        return { code: normalized, label: 'Urgencia alta (+12%)', multiplier: 1.12 };
      case 'PREFERRED_CLIENT':
        return { code: normalized, label: 'Cliente preferente (-5%)', multiplier: 0.95 };
      case 'WEEKEND':
        return { code: normalized, label: 'Trabajo en fin de semana (+8%)', multiplier: 1.08 };
      default:
        return { code: 'STANDARD', label: 'Tarifa estándar', multiplier: 1 };
    }
  }

  private resolveValidUntil(validityDays?: number | null) {
    const days = typeof validityDays === 'number' && validityDays > 0 ? validityDays : 30;
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }
}
