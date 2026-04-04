import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ActivityType, ApprovalStatus, Prisma, QuotationStatus, SpecialConsiderationType, UserRole } from '@prisma/client';
import { PrismaService } from '../../../../shared/infrastructure/prisma.service';
import { CatalogService } from '../../../catalog/infrastructure/services/catalog.service';
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

@Injectable()
export class QuotationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogService: CatalogService,
    private readonly pdfService: PdfService,
    private readonly pipelineService: PipelineService,
  ) {}

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
        sections: this.toJsonSections(this.defaultCommercialSections()),
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

  listWorkItemCatalog() {
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
    const existing = await this.prisma.activityCatalog.findUnique({
      where: { name },
    });

    if (existing && existing.deletedAt === null) {
      throw new ConflictException('Ya existe un trabajo con ese nombre.');
    }

    if (existing) {
      return this.prisma.activityCatalog.update({
        where: { id: existing.id },
        data: { name, deletedAt: null },
      });
    }

    return this.prisma.activityCatalog.create({
      data: { name },
    });
  }

  async updateWorkItemCatalog(id: string, dto: UpdateWorkItemCatalogDto) {
    const existing = await this.prisma.activityCatalog.findFirst({
      where: { id, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException('El trabajo solicitado ya no existe.');
    }

    const name = this.normalizeWorkItemName(dto.name);
    const duplicated = await this.prisma.activityCatalog.findUnique({
      where: { name },
    });

    if (duplicated && duplicated.id !== id && duplicated.deletedAt === null) {
      throw new ConflictException('Ya existe otro trabajo con ese nombre.');
    }

    if (duplicated && duplicated.id !== id && duplicated.deletedAt !== null) {
      throw new ConflictException('Ya existe un trabajo archivado con ese nombre.');
    }

    return this.prisma.activityCatalog.update({
      where: { id },
      data: { name },
    });
  }

  async deleteWorkItemCatalog(id: string) {
    const existing = await this.prisma.activityCatalog.findFirst({
      where: { id, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException('El trabajo solicitado ya no existe.');
    }

    return this.prisma.activityCatalog.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
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
      const client = await this.requireClient(dto.clientId);
      const pricing = await this.buildPricingPayload(dto);
      const {
        itemRows,
        specialConsiderationRows,
        subtotal,
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
      const sequence = (await this.prisma.quotation.count()) + 1;
      const year = new Date().getFullYear();
      const folio = `COT.${String(sequence).padStart(4, '0')}-${year}`;
      const pipeline = await this.pipelineService.ensureDefaultPipeline();
      const initialStage = pipeline?.stages.find((stage) => stage.code === QuotationStatus.BORRADOR);

      if (!pipeline || !initialStage) {
        throw new BadRequestException('Pipeline comercial no disponible');
      }

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

      const quotation = await this.prisma.quotation.create({
        data: {
          folio,
          clientId: client.id,
          pipelineId: pipeline.id,
          stageId: initialStage.id,
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
          discountPercent,
          requiresApproval,
          approvalStatus,
          title: dto.title,
          notes: dto.notes,
          durationOfWork: dto.durationOfWork,
          termsAndConditions: dto.termsAndConditions,
          commercialSections: commercialSectionsJson,
          currency,
          createdById:
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
            (await this.ensureSystemUser()),
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
              description: `Cotización creada en ${initialStage.name} por ${currency} ${total.toFixed(2)}`,
              payload: {
                stage: initialStage.name,
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
      });

      await this.syncSpecialConsiderationCatalog(specialConsiderationRows);
      await this.syncServiceTemplate(dto);
      await this.syncWorkItemCatalog(commercialSections);

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
        throw new BadRequestException(
          'Ya existe un folio o un dato unico en conflicto. Reinicia la API y vuelve a intentar.',
        );
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

    const client = await this.requireClient(dto.clientId);
    const pricing = await this.buildPricingPayload(dto);
    const {
      itemRows,
      specialConsiderationRows,
      subtotal,
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
          serviceType: dto.serviceType?.trim() || null,
          templateType: dto.templateType?.trim() || null,
          coverTitle: dto.coverTitle?.trim() || dto.title,
          executiveSummary: dto.executiveSummary?.trim() || null,
          validUntil: this.resolveValidUntil(dto.validityDays),
          pricingRule: dto.pricingRule?.trim() || null,
          pricingRuleLabel,
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

    return this.prisma.quotation.update({
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

    return this.prisma.quotation.update({
      where: { id },
      data: {
        clientId: dto.clientId,
        coverTitle: dto.coverTitle,
        executiveSummary: dto.executiveSummary,
        serviceType: dto.serviceType,
        templateType: dto.templateType,
        pricingRule: dto.pricingRule,
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
              coverTitle: dto.coverTitle,
              executiveSummary: dto.executiveSummary,
              serviceType: dto.serviceType,
              templateType: dto.templateType,
              pricingRule: dto.pricingRule,
              title: dto.title,
              notes: dto.notes,
            },
          },
        },
      },
      include: { client: true, items: true, stage: true, activities: true },
    });
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
        rfc: quotation.client.rfc,
        address: quotation.client.address || undefined,
      },
      quotation: {
        title: quotation.title,
        sellerName: this.normalizeOwnerName(quotation.createdBy.name, quotation.createdBy.email),
        notes: quotation.notes || undefined,
        durationOfWork: quotation.durationOfWork || undefined,
        termsAndConditions: quotation.termsAndConditions || undefined,
        commercialSections: Array.isArray(quotation.commercialSections)
          ? this.normalizeCommercialSections(
              quotation.commercialSections as Array<{ title: string; content: string }>,
            )
          : undefined,
        subtotal: quotation.subtotal.toString(),
        tax: quotation.tax.toString(),
        total: quotation.total.toString(),
        currency: quotation.currency,
      },
      items: quotation.items.map((item) => ({
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
        rfc: quotation.client.rfc,
        address: quotation.client.address || undefined,
      },
      quotation: {
        title: quotation.title,
        sellerName: this.normalizeOwnerName(quotation.createdBy.name, quotation.createdBy.email),
        notes: quotation.notes || undefined,
        durationOfWork: quotation.durationOfWork || undefined,
        termsAndConditions: quotation.termsAndConditions || undefined,
        commercialSections: Array.isArray(quotation.commercialSections)
          ? this.normalizeCommercialSections(
              quotation.commercialSections as Array<{ title: string; content: string }>,
            )
          : undefined,
        subtotal: quotation.subtotal.toString(),
        tax: quotation.tax.toString(),
        total: quotation.total.toString(),
        currency: quotation.currency,
      },
      items: quotation.items.map((item) => ({
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

    const sequence = (await this.prisma.quotation.count()) + 1;
    const year = new Date().getFullYear();
    const folio = `COT.${String(sequence).padStart(4, '0')}-${year}`;
    const pipeline = await this.pipelineService.ensureDefaultPipeline();
    const draftStage = pipeline?.stages.find((stage) => stage.code === QuotationStatus.BORRADOR);
    const rootId = quotation.rootQuotationId || quotation.id;

    return this.prisma.quotation.create({
      data: {
        folio,
        rootQuotationId: rootId,
        previousVersionId: quotation.id,
        clientId: quotation.clientId,
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
        tax: quotation.tax,
        total: quotation.total,
        currency: quotation.currency,
        createdById: actorUserId || quotation.createdById,
        items: {
          create: quotation.items.map((item) => ({
            supplyId: item.supplyId || undefined,
            pricingProfileId: item.pricingProfileId || undefined,
            supplyCode: item.supplyCode,
            supplyName: item.supplyName,
            categoryName: item.categoryName,
            pricingProfileName: item.pricingProfileName,
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
    });
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

    return this.prisma.quotation.update({
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

  private async buildPricingPayload(dto: CreateQuotationDto) {
    const supplies = await this.prisma.supply.findMany({
      where: { id: { in: dto.items.map((item) => item.serviceId) } },
      include: { category: true },
    });
    const pricingProfiles = await this.prisma.supplyPricingProfile.findMany({
      where: { id: { in: dto.items.map((item) => item.pricingProfileId) } },
    });

    const itemRows: Array<{
      supplyId?: string;
      pricingProfileId?: string;
      supplyCode: string;
      supplyName: string;
      categoryName: string;
      pricingProfileName: string;
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
      const supply = supplies.find((current) => current.id === item.serviceId);
      if (!supply) {
        throw new NotFoundException(`Servicio ${item.serviceId} no encontrado`);
      }

      const pricingProfile = pricingProfiles.find(
        (current) =>
          current.id === item.pricingProfileId && current.supplyId === item.serviceId,
      );
      if (!pricingProfile) {
        throw new NotFoundException(
          `Perfil de precio ${item.pricingProfileId} no encontrado para ${supply.code}`,
        );
      }

      const quantity = item.quantity;
      const mxnPrice = pricingProfile.mxnPrice ? Number(pricingProfile.mxnPrice) : 0;
      const usdPrice = pricingProfile.usdPrice ? Number(pricingProfile.usdPrice) : 0;
      let catalogUnitPrice = 0;
      let priceOriginCurrency = currency;

      if (currency === 'USD') {
        if (usdPrice) {
          catalogUnitPrice = usdPrice;
          priceOriginCurrency = 'USD';
        } else if (mxnPrice && exchangeRate) {
          catalogUnitPrice = Number((mxnPrice / exchangeRate).toFixed(2));
          priceOriginCurrency = 'MXN';
        }
      } else if (mxnPrice) {
        catalogUnitPrice = mxnPrice;
        priceOriginCurrency = 'MXN';
      } else if (usdPrice && exchangeRate) {
        catalogUnitPrice = Number((usdPrice * exchangeRate).toFixed(2));
        priceOriginCurrency = 'USD';
      }

      if (!catalogUnitPrice) {
        throw new NotFoundException(
          `Suministro ${supply.code} sin precio configurado en ${currency}`,
        );
      }

      const unitPrice =
        typeof item.unitPriceOverride === 'number' && item.unitPriceOverride > 0
          ? item.unitPriceOverride
          : Number((catalogUnitPrice * pricingRule.multiplier).toFixed(2));

      const totalPrice = unitPrice * quantity;
      const catalogTotalPrice = Number((catalogUnitPrice * quantity).toFixed(2));
      catalogTotal += catalogTotalPrice;
      subtotal += item.isOptional ? 0 : totalPrice;

      itemRows.push({
        supplyId: supply.id,
        pricingProfileId: pricingProfile.id,
        supplyCode: supply.code,
        supplyName: supply.name,
        categoryName: supply.category.name,
        pricingProfileName: pricingProfile.name,
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
          itemRows.push({
            supplyCode: 'ADICIONAL',
            supplyName: concept || `Adicional ${percentage}%`,
            categoryName: 'Consideraciones especiales',
            pricingProfileName: `${percentage}%`,
            quantity: 1,
            unitPrice: additionalAmount,
            totalPrice: additionalAmount,
            exchangeRateUsed: exchangeRate,
            priceOriginCurrency: currency,
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
        itemRows.push({
          supplyCode: 'ADICIONAL',
          supplyName: concept || 'Consideración especial',
          categoryName: 'Consideraciones especiales',
          pricingProfileName: 'Monto fijo',
          quantity,
          unitPrice: appliedAmount,
          totalPrice: appliedAmount,
          exchangeRateUsed: exchangeRate,
          priceOriginCurrency: currency,
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
      itemRows.push({
        supplyCode: 'VIATICOS',
        supplyName: consideration.location?.trim()
          ? consideration.location.trim()
          : 'Sin descripción',
        categoryName: 'Viáticos',
        pricingProfileName: 'Monto fijo',
        quantity: 1,
        unitPrice: appliedAmount,
        totalPrice: appliedAmount,
        exchangeRateUsed: exchangeRate,
        priceOriginCurrency: currency,
      });
    }

    const tax = Number((subtotal * 0.16).toFixed(2));
    const total = Number((subtotal + tax).toFixed(2));
    const discountPercent = catalogTotal
      ? Number((((catalogTotal - subtotal) / catalogTotal) * 100).toFixed(2))
      : 0;
    const requiresApproval = discountPercent > 10;

    return {
      itemRows,
      specialConsiderationRows,
      subtotal,
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
      : this.defaultCommercialSections();

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

  private defaultCommercialSections() {
    return [
      {
        title: 'Trabajos a realizar:',
        content: '',
      },
      {
        title: 'Duracion de los trabajos:',
        content:
          'Una vez autorizado este presupuesto y colocada la orden por escrito a SISTEMAS ELECTRICOS ZARAGOZA S. A DE C. V. (SIEZA), el tiempo de realización es de:\nEl tiempo estimado es de 6 días en sitio, dependiendo de las facilidades de las instalaciones',
      },
      {
        title: 'Notas importantes:',
        content:
          '-La presente representa nuestra interpretación a sus requerimientos sobre la base de la información que nos proporcionaron y el alcance de suministro se limita a lo descrito en la\npresente oferta, cualquier desviación o equipo adicional, requerirá de una negociación del precio y tiempo de entrega cotizados.\n-No se contempla la reparación ni el refaccionamiento de ningún tipo, de ser necesario será cotizado por separado.\n-Se requiere de una orden de compra y el anticipo correspondiente previo al inicio de los trabajos.\n-Se consideran los viáticos del personal para este servicio, incluyendo la entrega de reportes de campo.\n-Nuestros equipos de pruebas cuentan con Protocolo de pruebas de laboratorio certificado, se entrega copia conjuntamente con los reportes.\n-Confirmar con al menos 5 días de anticipación\n-Todo atraso no imputable a SIEZA se cobrará a razón de $15,000.00 pesos por día. Por el grupo de personal considerado (1 Ingeniero y 1 Técnico)\n-Se entregará copia de los reportes de campo al concluir el servicio, y una semana después, se enviará la carpeta con todos los reportes, incluyendo el fotográfico.',
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

  private normalizeCommercialSections(
    sections: Array<{ title: string; content: string }>,
  ) {
    const defaults = this.defaultCommercialSections();
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

    await this.prisma.serviceCatalog.upsert({
      where: { name: normalizedName },
      update: {
        templateType: dto.templateType?.trim() || null,
        items: dto.items as unknown as Prisma.InputJsonValue,
        commercialSections: dto.commercialSections
          ? (dto.commercialSections as unknown as Prisma.InputJsonValue)
          : undefined,
        specialConsiderations: dto.specialConsiderations
          ? (dto.specialConsiderations as unknown as Prisma.InputJsonValue)
          : undefined,
        deletedAt: null,
      },
      create: {
        name: normalizedName,
        templateType: dto.templateType?.trim() || null,
        items: dto.items as unknown as Prisma.InputJsonValue,
        commercialSections: dto.commercialSections
          ? (dto.commercialSections as unknown as Prisma.InputJsonValue)
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
