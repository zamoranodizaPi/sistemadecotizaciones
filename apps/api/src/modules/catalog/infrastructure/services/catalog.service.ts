import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SupplyPrice } from '@prisma/client';
import * as XLSX from 'xlsx';
import { PrismaService } from '../../../../shared/infrastructure/prisma.service';
import {
  CloneServiceDto,
  CreateCategoryDto,
  CreateServiceDto,
  UpdateServiceDto,
} from '../../application/dto/create-service.dto';
import { UpdatePricingProfilesDto } from '../../application/dto/update-pricing-profiles.dto';

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeRelatedWork(value?: string) {
    if (!value) {
      return undefined;
    }

    const normalized = value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .join('\n');

    return normalized || undefined;
  }

  async listCatalog() {
    await this.syncActivityCatalogToConceptCategory();

    return this.prisma.category.findMany({
      where: { deletedAt: null },
      include: {
        supplies: {
          where: { deletedAt: null },
          include: {
            prices: {
              orderBy: { validFrom: 'desc' },
              take: 10,
            },
            pricingProfiles: {
              include: {
                versions: {
                  orderBy: { validFrom: 'desc' },
                  take: 10,
                },
              },
              orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
            },
          },
          orderBy: { name: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async syncActivityCatalogToConceptCategory() {
    const activities = await this.prisma.activityCatalog.findMany({
      where: { deletedAt: null },
      orderBy: [{ createdAt: 'asc' }, { name: 'asc' }],
    });

    const category = await this.prisma.category.upsert({
      where: { code: 'ACT' },
      update: {
        name: 'Actividades',
        description: 'Conceptos derivados del catálogo de actividades',
        deletedAt: null,
      },
      create: {
        code: 'ACT',
        name: 'Actividades',
        description: 'Conceptos derivados del catálogo de actividades',
      },
    });

    const existingSupplies = await this.prisma.supply.findMany({
      where: { categoryId: category.id },
      include: { pricingProfiles: true },
      orderBy: [{ createdAt: 'asc' }, { name: 'asc' }],
    });
    const allSupplyCodes = await this.prisma.supply.findMany({
      select: {
        id: true,
        categoryId: true,
        code: true,
      },
    });
    const supplyByCode = new Map(allSupplyCodes.map((supply) => [supply.code, supply]));
    const usedSupplyCodes = new Set(allSupplyCodes.map((supply) => supply.code));

    const activeNames = new Set<string>();
    let nextSequence =
      allSupplyCodes
        .map((supply) => Number(supply.code.replace(/^ACT-/, '')))
        .filter((value) => Number.isFinite(value))
        .reduce((max, current) => Math.max(max, current), 0) + 1;
    const nextActivityCode = () => {
      let code = `ACT-${String(nextSequence++).padStart(2, '0')}`;
      while (usedSupplyCodes.has(code)) {
        code = `ACT-${String(nextSequence++).padStart(2, '0')}`;
      }
      return code;
    };

    for (const activity of activities) {
      activeNames.add(activity.name);

      const activityCode = activity.code?.trim() || undefined;
      const matchedSupply =
        existingSupplies.find((supply) => supply.name === activity.name) ||
        (activityCode
          ? existingSupplies.find((supply) => supply.code === activityCode)
          : undefined);
      const requestedCodeOwner = activityCode ? supplyByCode.get(activityCode) : undefined;
      const canUseActivityCode =
        activityCode &&
        (!requestedCodeOwner || requestedCodeOwner.id === matchedSupply?.id);
      const code = canUseActivityCode ? activityCode : matchedSupply?.code || nextActivityCode();

      const supply = matchedSupply
        ? await this.prisma.supply.update({
            where: { id: matchedSupply.id },
            data: {
              categoryId: category.id,
              code,
              name: activity.name,
              description: 'Actividad cotizable',
              unit: 'actividad',
              relatedWork: activity.name,
              deletedAt: null,
            },
          })
        : await this.prisma.supply.upsert({
            where: { code },
            update: {
              categoryId: category.id,
              name: activity.name,
              description: 'Actividad cotizable',
              unit: 'actividad',
              relatedWork: activity.name,
              deletedAt: null,
            },
            create: {
              categoryId: category.id,
              code,
              name: activity.name,
              description: 'Actividad cotizable',
              unit: 'actividad',
              relatedWork: activity.name,
            },
          });
      usedSupplyCodes.add(code);
      supplyByCode.set(code, { id: supply.id, categoryId: supply.categoryId, code: supply.code });

      if (!matchedSupply) {
        existingSupplies.push({
          ...supply,
          pricingProfiles: [],
        });
      }

      if (activity.code !== code || activity.unitPrice === null) {
        await this.prisma.activityCatalog.update({
          where: { id: activity.id },
          data: {
            code,
            unitPrice: activity.unitPrice ?? 0,
          },
        });
      }

      const baseProfile = await this.prisma.supplyPricingProfile.findFirst({
        where: {
          supplyId: supply.id,
          code: 'BASE',
        },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      });
      const unitPrice = Number(activity.unitPrice ?? 0);

      if (baseProfile) {
        await this.prisma.supplyPricingProfile.update({
          where: { id: baseProfile.id },
          data: {
            name: 'Actividad base',
            sortOrder: 0,
            mxnPrice: unitPrice,
            usdPrice: 0,
          },
        });
      } else {
        await this.prisma.supplyPricingProfile.upsert({
          where: {
            supplyId_code_name: {
              supplyId: supply.id,
              code: 'BASE',
              name: 'Actividad base',
            },
          },
          update: {
            sortOrder: 0,
            mxnPrice: unitPrice,
            usdPrice: 0,
          },
          create: {
            supplyId: supply.id,
            code: 'BASE',
            name: 'Actividad base',
            sortOrder: 0,
            mxnPrice: unitPrice,
            usdPrice: 0,
          },
        });
      }
    }

    const staleSupplies = existingSupplies.filter(
      (supply) => supply.code.startsWith('ACT-') && !activeNames.has(supply.name),
    );
    await Promise.all(
      staleSupplies.map((supply) =>
        this.prisma.supply.update({
          where: { id: supply.id },
          data: { deletedAt: new Date() },
        }),
      ),
    );
  }

  async ensureActivityConcept(input: { name: string; code?: string; unitPrice?: number }) {
    const normalizedName = input.name.trim();
    const normalizedCode = input.code?.trim().toUpperCase() || undefined;
    const normalizedUnitPrice = Number(input.unitPrice ?? 0);
    if (!normalizedName) {
      throw new BadRequestException('El nombre de la actividad es obligatorio.');
    }

    const existingByName = await this.prisma.activityCatalog.findUnique({
      where: { name: normalizedName },
    });
    const existingByCode = normalizedCode
      ? await this.prisma.activityCatalog.findUnique({
          where: { code: normalizedCode },
        })
      : null;
    const hasConflictingMatches =
      Boolean(existingByName && existingByCode && existingByName.id !== existingByCode.id);
    const existing =
      hasConflictingMatches
        ? existingByCode
        : (existingByName || existingByCode);

    if (existing) {
      await this.prisma.activityCatalog.update({
        where: { id: existing.id },
        data: {
          name: hasConflictingMatches ? existing.name : normalizedName,
          code: normalizedCode || existing.code,
          unitPrice: normalizedUnitPrice,
          deletedAt: null,
        },
      });
    } else {
      await this.prisma.activityCatalog.create({
        data: {
          name: normalizedName,
          code: normalizedCode,
          unitPrice: normalizedUnitPrice,
        },
      });
    }

    await this.syncActivityCatalogToConceptCategory();

    const supply = await this.prisma.supply.findFirst({
      where: {
        OR: [
          { name: normalizedName },
          ...(normalizedCode ? [{ code: normalizedCode }] : []),
        ],
        deletedAt: null,
        category: { code: 'ACT' },
      },
      include: {
        pricingProfiles: {
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        },
        category: true,
      },
    });

    if (!supply) {
      throw new NotFoundException('No fue posible sincronizar la actividad en el catálogo.');
    }

    const pricingProfile = supply.pricingProfiles.find((profile) => profile.code === 'BASE') || supply.pricingProfiles[0];

    if (!pricingProfile) {
      throw new NotFoundException('La actividad no tiene perfil de precio base.');
    }

    return {
      supply,
      pricingProfile,
    };
  }

  listDetectedServices() {
    return this.prisma.detectedCatalogService.findMany({
      where: { status: 'PENDING' },
      orderBy: [{ usageCount: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  async updateDetectedServiceStatus(id: string, status: 'PENDING' | 'APPROVED' | 'DISMISSED') {
    return this.prisma.detectedCatalogService.update({
      where: { id },
      data: { status },
    });
  }

  async createCategory(dto: CreateCategoryDto) {
    const code = dto.code.trim().toUpperCase();
    const name = dto.name.trim();

    const existingByCode = await this.prisma.category.findUnique({
      where: { code },
    });

    if (existingByCode) {
      return this.prisma.category.update({
        where: { id: existingByCode.id },
        data: {
          code,
          name,
          description: dto.description,
          deletedAt: null,
        },
      });
    }

    const existingByName = await this.prisma.category.findFirst({
      where: {
        name,
      },
    });

    if (existingByName) {
      return this.prisma.category.update({
        where: { id: existingByName.id },
        data: {
          code,
          name,
          description: dto.description,
          deletedAt: null,
        },
      });
    }

    return this.prisma.category.create({
      data: {
        code,
        name,
        description: dto.description,
      },
    });
  }

  async createOrVersionService(dto: CreateServiceDto) {
    return this.prisma.$transaction(async (tx) => {
      const categoryCode = dto.categoryCode.trim().toUpperCase();
      const serviceCode = dto.serviceCode.trim().toUpperCase();
      const categoryRecord = await tx.category.findUnique({
        where: { code: categoryCode },
      });
      const category = categoryRecord
        ? await tx.category.update({
            where: { id: categoryRecord.id },
            data: {
              code: categoryCode,
              name: categoryRecord.name || categoryCode,
              deletedAt: null,
            },
          })
        : await tx.category.create({
            data: {
              code: categoryCode,
              name: categoryCode,
            },
          });

      const existingService = await tx.supply.findUnique({
        where: { code: serviceCode },
      });

      const service = existingService
        ? await tx.supply.update({
            where: { id: existingService.id },
            data: {
              code: serviceCode,
              name: dto.name,
              description: dto.description,
              unit: dto.unit,
              relatedWork: this.normalizeRelatedWork(dto.relatedWork),
              categoryId: category.id,
              deletedAt: null,
            },
          })
        : await tx.supply.create({
            data: {
              code: serviceCode,
              name: dto.name,
              description: dto.description,
              unit: dto.unit,
              relatedWork: this.normalizeRelatedWork(dto.relatedWork),
              categoryId: category.id,
            },
          });

      if (typeof dto.price !== 'number') {
        return { service, price: null, versioned: false };
      }

      const activePrice = await tx.supplyPrice.findFirst({
        where: { supplyId: service.id, validTo: null },
        orderBy: { validFrom: 'desc' },
      });

      if (activePrice && Number(activePrice.price) === dto.price) {
        return { service, price: activePrice, versioned: false };
      }

      if (activePrice) {
        await tx.supplyPrice.update({
          where: { id: activePrice.id },
          data: { validTo: new Date() },
        });
      }

      const nextPrice = await tx.supplyPrice.create({
        data: {
          supplyId: service.id,
          price: dto.price,
          validFrom: new Date(),
          source: dto.source || 'manual',
        },
      });

      return { service, price: nextPrice, versioned: true };
    });
  }

  async updateService(serviceId: string, dto: UpdateServiceDto) {
    const existing = await this.prisma.supply.findUnique({
      where: { id: serviceId },
    });

    if (!existing) {
      throw new NotFoundException('Servicio no encontrado');
    }

    return this.prisma.supply.update({
      where: { id: serviceId },
      data: {
        code: dto.code.trim().toUpperCase(),
        name: dto.name.trim(),
        description: dto.description,
        unit: dto.unit,
        relatedWork: this.normalizeRelatedWork(dto.relatedWork),
      },
    });
  }

  async cloneService(serviceId: string, dto: CloneServiceDto) {
    const source = await this.prisma.supply.findUnique({
      where: { id: serviceId },
      include: {
        pricingProfiles: {
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        },
        prices: {
          where: { validTo: null },
          orderBy: { validFrom: 'desc' },
          take: 1,
        },
        category: true,
      },
    });

    if (!source) {
      throw new NotFoundException('Servicio origen no encontrado');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const categoryCode = (dto.categoryCode || source.category.code).trim().toUpperCase();
        const category = await tx.category.findUnique({ where: { code: categoryCode } });

        if (!category) {
          throw new NotFoundException('Categoria destino no encontrada');
        }

        const service = await tx.supply.create({
          data: {
            categoryId: category.id,
            code: dto.code.trim().toUpperCase(),
            name: dto.name.trim(),
            description: dto.description ?? source.description,
            unit: dto.unit ?? source.unit,
            relatedWork: this.normalizeRelatedWork(dto.relatedWork ?? source.relatedWork ?? undefined),
          },
        });

        if (source.pricingProfiles.length) {
          await tx.supplyPricingProfile.createMany({
            data: source.pricingProfiles.map((profile) => ({
              supplyId: service.id,
              code: profile.code,
              name: profile.name,
              sortOrder: profile.sortOrder,
              mxnPrice: profile.mxnPrice,
              usdPrice: profile.usdPrice,
            })),
          });
        }

        const activePrice = source.prices[0];
        if (activePrice) {
          await tx.supplyPrice.create({
            data: {
              supplyId: service.id,
              price: activePrice.price,
              validFrom: new Date(),
              source: 'service-clone',
            },
          });
        }

        return tx.supply.findUnique({
          where: { id: service.id },
          include: {
            pricingProfiles: {
              orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
            },
          },
        });
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const target = Array.isArray(error.meta?.target)
          ? error.meta?.target.join(', ')
          : String(error.meta?.target || '');

        if (target.includes('Service_code_key')) {
          throw new BadRequestException(
            'Ya existe un servicio con ese codigo. Usa un codigo diferente para la copia.',
          );
        }

        if (
          target.includes('ServicePricingProfile_serviceId_code_key') ||
          target.includes('ServicePricingProfile_serviceId_code_name_key')
        ) {
          throw new BadRequestException(
            'La base de datos del catalogo aun no esta alineada. Aplica la migracion allow_duplicate_pricing_codes_per_service y reinicia la API.',
          );
        }
      }

      throw error;
    }
  }

  async deleteService(serviceId: string) {
    const service = await this.prisma.supply.findUnique({
      where: { id: serviceId },
      select: { id: true },
    });

    if (!service) {
      throw new NotFoundException('Servicio no encontrado');
    }

    return this.prisma.supply.update({
      where: { id: serviceId },
      data: {
        deletedAt: new Date(),
      },
    });
  }

  async deleteCategory(categoryId: string) {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
      select: { id: true },
    });

    if (!category) {
      throw new NotFoundException('Categoría no encontrada');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.supply.updateMany({
        where: { categoryId, deletedAt: null },
        data: { deletedAt: new Date() },
      });

      return tx.category.update({
        where: { id: categoryId },
        data: {
          deletedAt: new Date(),
        },
      });
    });
  }

  async clearCatalog() {
    const now = new Date();

    await this.prisma.$transaction([
      this.prisma.supply.updateMany({
        where: { deletedAt: null },
        data: { deletedAt: now },
      }),
      this.prisma.category.updateMany({
        where: { deletedAt: null },
        data: { deletedAt: now },
      }),
    ]);

    return { cleared: true };
  }

  async resolveActivePrice(serviceId: string): Promise<SupplyPrice | null> {
    return this.prisma.supplyPrice.findFirst({
      where: { supplyId: serviceId, validTo: null },
      orderBy: { validFrom: 'desc' },
    });
  }

  async bootstrapPricingProfiles() {
    return { processed: 0 };
  }

  async updatePricingProfiles(dto: UpdatePricingProfilesDto) {
    const service = await this.prisma.supply.findUnique({
      where: { id: dto.serviceId },
      select: { id: true },
    });

    if (!service) {
      throw new NotFoundException('Servicio no encontrado');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const changes: Array<{
          pricingProfileId: string;
          code: string;
          name: string;
          action: string;
          validFrom: string;
        }> = [];

        for (const profile of dto.profiles) {
          const normalizedCode = profile.code.trim().toUpperCase();
          const normalizedName = profile.name.trim();
          const normalizedValidFrom = this.normalizeValidFrom(profile.validFrom);
          const source = profile.source?.trim() || 'manual';

          const data = {
            code: normalizedCode,
            name: normalizedName,
            sortOrder: profile.sortOrder ?? 0,
            mxnPrice:
              typeof profile.mxnPrice === 'number'
                ? new Prisma.Decimal(profile.mxnPrice)
                : null,
            usdPrice:
              typeof profile.usdPrice === 'number'
                ? new Prisma.Decimal(profile.usdPrice)
                : null,
          };

          let pricingProfileId = profile.id;

          if (pricingProfileId) {
            await tx.supplyPricingProfile.update({
              where: { id: profile.id },
              data,
            });
          } else {
            const existingProfile = await tx.supplyPricingProfile.findFirst({
              where: {
                supplyId: dto.serviceId,
                code: normalizedCode,
                name: normalizedName,
              },
              select: { id: true },
            });

            if (existingProfile) {
              pricingProfileId = existingProfile.id;
              await tx.supplyPricingProfile.update({
                where: { id: existingProfile.id },
                data,
              });
            } else {
              const createdProfile = await tx.supplyPricingProfile.create({
                data: {
                  supplyId: dto.serviceId,
                  ...data,
                },
                select: { id: true },
              });
              pricingProfileId = createdProfile.id;
            }
          }

          if (!pricingProfileId) {
            throw new BadRequestException('No fue posible resolver la opcion de precio a versionar');
          }

          const versionResult = await this.syncPricingProfileVersion(tx, {
            pricingProfileId,
            mxnPrice: typeof profile.mxnPrice === 'number' ? profile.mxnPrice : null,
            usdPrice: typeof profile.usdPrice === 'number' ? profile.usdPrice : null,
            validFrom: normalizedValidFrom,
            source,
          });

          changes.push({
            pricingProfileId,
            code: normalizedCode,
            name: normalizedName,
            action: versionResult.action,
            validFrom: normalizedValidFrom.toISOString(),
          });
        }

        const serviceRecord = await tx.supply.findUnique({
          where: { id: dto.serviceId },
          include: {
            pricingProfiles: {
              include: {
                versions: {
                  orderBy: { validFrom: 'desc' },
                  take: 10,
                },
              },
              orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
            },
          },
        });

        return {
          ...serviceRecord,
          changes,
        };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new BadRequestException(
          'La base aun tiene el indice viejo de opciones de precio. Aplica la migracion allow_duplicate_pricing_codes_per_service y reinicia la API.',
        );
      }

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2021' || error.code === 'P2022')
      ) {
        throw new BadRequestException(
          'La base local no tiene las tablas o columnas nuevas del historico de precios. Aplica la migracion add_service_pricing_profile_versions y reinicia la API.',
        );
      }

      throw error;
    }
  }

  async getExchangeRate() {
    const existing = await this.prisma.exchangeRateSetting.findFirst({
      where: {
        baseCurrency: 'USD',
        quoteCurrency: 'MXN',
      },
    });

    if (existing) {
      return existing;
    }

    return this.prisma.exchangeRateSetting.create({
      data: {
        baseCurrency: 'USD',
        quoteCurrency: 'MXN',
        rate: new Prisma.Decimal(17),
        source: 'seed',
        autoSync: true,
      },
    });
  }

  async refreshExchangeRate() {
    const response = await fetch('https://open.er-api.com/v6/latest/USD');
    if (!response.ok) {
      throw new NotFoundException('No fue posible obtener el tipo de cambio automatico');
    }

    const payload = (await response.json()) as {
      result?: string;
      rates?: Record<string, number>;
      time_last_update_utc?: string;
    };
    const mxnRate = payload.rates?.MXN;

    if (!mxnRate) {
      throw new NotFoundException('La fuente externa no devolvio tipo de cambio MXN');
    }

    return this.prisma.exchangeRateSetting.upsert({
      where: {
        baseCurrency_quoteCurrency: {
          baseCurrency: 'USD',
          quoteCurrency: 'MXN',
        },
      },
      update: {
        rate: new Prisma.Decimal(mxnRate),
        source: 'open.er-api.com',
        fetchedAt: payload.time_last_update_utc
          ? new Date(payload.time_last_update_utc)
          : new Date(),
        autoSync: true,
      },
      create: {
        baseCurrency: 'USD',
        quoteCurrency: 'MXN',
        rate: new Prisma.Decimal(mxnRate),
        source: 'open.er-api.com',
        fetchedAt: payload.time_last_update_utc
          ? new Date(payload.time_last_update_utc)
          : new Date(),
        autoSync: true,
      },
    });
  }

  async updateExchangeRate(rate: number) {
    return this.prisma.exchangeRateSetting.upsert({
      where: {
        baseCurrency_quoteCurrency: {
          baseCurrency: 'USD',
          quoteCurrency: 'MXN',
        },
      },
      update: {
        rate: new Prisma.Decimal(rate),
        source: 'manual-override',
        autoSync: false,
        fetchedAt: new Date(),
      },
      create: {
        baseCurrency: 'USD',
        quoteCurrency: 'MXN',
        rate: new Prisma.Decimal(rate),
        source: 'manual-override',
        autoSync: false,
        fetchedAt: new Date(),
      },
    });
  }

  async exportCatalogWorkbook() {
    const categories = await this.prisma.category.findMany({
      where: { deletedAt: null },
      include: {
        supplies: {
          where: { deletedAt: null },
          include: {
            pricingProfiles: {
              include: {
                versions: {
                  orderBy: { validFrom: 'desc' },
                },
              },
              orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
            },
          },
          orderBy: [{ code: 'asc' }, { name: 'asc' }],
        },
      },
      orderBy: { name: 'asc' },
    });

    const workbook = XLSX.utils.book_new();

    for (const category of categories) {
      const groups = new Map<string, typeof category.supplies>();

      for (const service of category.supplies) {
        const signature = service.pricingProfiles
          .map((profile) => `${profile.code}::${profile.name}`)
          .join('|');
        const groupKey = signature || 'NO_OPTIONS';
        groups.set(groupKey, [...(groups.get(groupKey) || []), service]);
      }

      let sheetIndex = 1;
      for (const [, services] of groups) {
        const optionColumns = services[0]?.pricingProfiles.slice(0, 3) || [];
        const sheetRows: Array<Array<string | number>> = [
          [
            'CATEGORIA',
            'UNIDAD',
            'DESCRIPCION',
            'SUFIJO',
            'CONSECUTIVO',
            'NOMBRE SERVICIO',
            'OPCION_1',
            'OPCION_2',
            'OPCION_3',
            'VIGENCIA',
            'TRABAJOS RELACIONADOS',
          ],
          [
            '',
            '',
            '',
            '',
            '',
            '',
            optionColumns[0]?.code || 'NA',
            optionColumns[1]?.code || 'NA',
            optionColumns[2]?.code || 'NA',
            '',
            '',
          ],
          [
            '',
            '',
            '',
            '',
            '',
            '',
            optionColumns[0]?.name || 'NA',
            optionColumns[1]?.name || 'NA',
            optionColumns[2]?.name || 'NA',
            '',
            '',
          ],
        ];

        for (const service of services) {
          const matchedOptions = optionColumns.map((option) =>
            service.pricingProfiles.find(
              (profile) => profile.code === option.code && profile.name === option.name,
            ),
          );
          const openVersions = matchedOptions
            .map((profile) => profile?.versions.find((version) => version.validTo === null))
            .filter(Boolean);
          const validFrom = openVersions
            .map((version) => version!.validFrom)
            .sort((left, right) => right.getTime() - left.getTime())[0];

          sheetRows.push([
            category.name,
            service.unit || '',
            service.description || '',
            this.extractServiceSuffix(service.code),
            this.extractServiceConsecutive(service.code),
            service.name,
            matchedOptions[0]?.mxnPrice != null ? Number(matchedOptions[0].mxnPrice) : 'NA',
            matchedOptions[1]?.mxnPrice != null ? Number(matchedOptions[1].mxnPrice) : 'NA',
            matchedOptions[2]?.mxnPrice != null ? Number(matchedOptions[2].mxnPrice) : 'NA',
            validFrom ? validFrom.toISOString().slice(0, 10) : '',
            service.relatedWork || '',
          ]);
        }

        const worksheet = XLSX.utils.aoa_to_sheet(sheetRows);
        XLSX.utils.book_append_sheet(
          workbook,
          worksheet,
          this.buildSheetName(category.code, sheetIndex),
        );
        sheetIndex += 1;
      }
    }

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    return {
      fileName: `catalogo-servicios-${new Date().toISOString().slice(0, 10)}.xlsx`,
      file: buffer.toString('base64'),
    };
  }

  private normalizeValidFrom(value?: string) {
    if (!value) {
      return this.startOfUtcDay(new Date());
    }

    return this.startOfUtcDay(new Date(value));
  }

  private startOfUtcDay(value: Date) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }

  private async syncPricingProfileVersion(
    tx: Prisma.TransactionClient,
    input: {
      pricingProfileId: string;
      mxnPrice: number | null;
      usdPrice: number | null;
      validFrom: Date;
      source: string;
    },
  ) {
    const sameDateVersion = await tx.supplyPricingProfileVersion.findUnique({
      where: {
        pricingProfileId_validFrom: {
          pricingProfileId: input.pricingProfileId,
          validFrom: input.validFrom,
        },
      },
    });

    const mxnDecimal =
      typeof input.mxnPrice === 'number' ? new Prisma.Decimal(input.mxnPrice) : null;
    const usdDecimal =
      typeof input.usdPrice === 'number' ? new Prisma.Decimal(input.usdPrice) : null;

    if (sameDateVersion) {
      const updateData: Prisma.SupplyPricingProfileVersionUpdateInput = {};

      if (
        this.decimalChanged(sameDateVersion.mxnPrice, mxnDecimal)
      ) {
        updateData.mxnPrice = mxnDecimal;
      }

      if (
        this.decimalChanged(sameDateVersion.usdPrice, usdDecimal)
      ) {
        updateData.usdPrice = usdDecimal;
      }

      if (sameDateVersion.source !== input.source) {
        updateData.source = input.source;
      }

      if (Object.keys(updateData).length) {
        await tx.supplyPricingProfileVersion.update({
          where: { id: sameDateVersion.id },
          data: updateData,
        });
      }

      await this.syncCurrentProfileFromOpenVersion(tx, input.pricingProfileId);

      return {
        action: Object.keys(updateData).length ? 'UPDATED_SAME_VALIDITY' : 'UNCHANGED',
      };
    }

    const previousVersion = await tx.supplyPricingProfileVersion.findFirst({
      where: {
        pricingProfileId: input.pricingProfileId,
        validFrom: { lt: input.validFrom },
      },
      orderBy: { validFrom: 'desc' },
    });

    const nextVersion = await tx.supplyPricingProfileVersion.findFirst({
      where: {
        pricingProfileId: input.pricingProfileId,
        validFrom: { gt: input.validFrom },
      },
      orderBy: { validFrom: 'asc' },
    });

    if (
      previousVersion &&
      (!previousVersion.validTo || previousVersion.validTo.getTime() !== input.validFrom.getTime())
    ) {
      await tx.supplyPricingProfileVersion.update({
        where: { id: previousVersion.id },
        data: { validTo: input.validFrom },
      });
    }

    await tx.supplyPricingProfileVersion.create({
      data: {
        pricingProfileId: input.pricingProfileId,
        mxnPrice: mxnDecimal,
        usdPrice: usdDecimal,
        validFrom: input.validFrom,
        validTo: nextVersion?.validFrom ?? null,
        source: input.source,
      },
    });

    await this.syncCurrentProfileFromOpenVersion(tx, input.pricingProfileId);

    return {
      action: 'VERSION_CREATED',
    };
  }

  private async syncCurrentProfileFromOpenVersion(
    tx: Prisma.TransactionClient,
    pricingProfileId: string,
  ) {
    const openVersion = await tx.supplyPricingProfileVersion.findFirst({
      where: {
        pricingProfileId,
        validTo: null,
      },
      orderBy: { validFrom: 'desc' },
    });

    if (!openVersion) {
      return;
    }

    await tx.supplyPricingProfile.update({
      where: { id: pricingProfileId },
      data: {
        mxnPrice: openVersion.mxnPrice,
        usdPrice: openVersion.usdPrice,
      },
    });
  }

  private decimalChanged(
    left: Prisma.Decimal | null,
    right: Prisma.Decimal | null,
  ) {
    if (!left && !right) {
      return false;
    }

    if (!left || !right) {
      return true;
    }

    return !left.equals(right);
  }

  private extractServiceSuffix(code: string) {
    return code.replace(/[0-9]+$/g, '');
  }

  private extractServiceConsecutive(code: string) {
    const match = code.match(/([0-9]+)$/);
    return match?.[1] || '';
  }

  private buildSheetName(categoryCode: string, sheetIndex: number) {
    const base = `${categoryCode.slice(0, 24)}_${sheetIndex}`;
    return base.slice(0, 31);
  }
}
