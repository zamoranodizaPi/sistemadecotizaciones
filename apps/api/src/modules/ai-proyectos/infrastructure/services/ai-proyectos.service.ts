import { BadRequestException, Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type Proyecto, type Solucion, type TrainingExample } from '@prisma/client';
import { PrismaService } from '../../../../shared/infrastructure/prisma.service';
import { normalizeForMatching, tokenOverlapScore } from '../../../../shared/domain/text-similarity';
import { PdfService } from '../../../quotations/infrastructure/services/pdf.service';
import { QuotationsService } from '../../../quotations/infrastructure/services/quotations.service';
import {
  ConvertirProyectoQuotationDto,
  GenerarProyectoDto,
} from '../../application/dto/ai-proyectos.dto';

type ProyectoGenerado = {
  proyecto: string;
  soluciones: Array<{
    tipo: string;
    incluyeIngenieria: boolean;
    incluyeInstalacion: boolean;
    incluyePuestaMarcha: boolean;
    incluyeMantenimiento: boolean;
    componentes: Array<{
      tipo: 'servicio' | 'material';
      nombre: string;
      marca?: string | null;
      categoria: string;
      costoBase: number;
      cantidad: number;
    }>;
  }>;
};

type CostosDinamicos = {
  costo_base: number;
  materiales: number;
  mano_obra: number;
  factores: {
    complejidad: number;
    zona: number;
    urgencia: number;
  };
  margen: number;
  total_final: number;
};

@Injectable()
export class AiProyectosService {
  private readonly logger = new Logger(AiProyectosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly quotationsService: QuotationsService,
    private readonly pdfService: PdfService,
  ) {}

  async generarProyecto(input: GenerarProyectoDto) {
    const normalizedInput = this.normalizeProjectInput(input);
    const embedding = await this.generarEmbedding(normalizedInput);
    const similares = await this.buscarEjemplosSimilares(normalizedInput, embedding);
    const catalogoIndustrial = await this.buildIndustrialCatalogSnapshot();

    let generated: ProyectoGenerado;
    let engine: 'openai' | 'rules' = 'rules';

    try {
      generated = await this.generateWithOpenAi(normalizedInput, similares, catalogoIndustrial);
      engine = 'openai';
      this.logger.log(`Proyecto generado con OpenAI para sector ${normalizedInput.sector}`);
    } catch (error) {
      this.logger.warn(
        `OpenAI no disponible para proyectos. Se usa fallback local. ${error instanceof Error ? error.message : 'Error desconocido'}`,
      );
      generated = this.generateWithRules(normalizedInput, similares, catalogoIndustrial);
    }

    const costos = await this.calcularCosto(generated, normalizedInput.condiciones);
    const persisted = await this.persistProyecto(normalizedInput, generated, costos);
    const training = await this.guardarEjemplo(
      normalizedInput,
      {
        proyecto: generated.proyecto,
        soluciones: generated.soluciones,
        costos,
      },
      null,
      embedding,
    );

    return {
      engine,
      input: normalizedInput,
      similares: this.withCostInfluence(similares).map((example) => ({
        id: example.id,
        score: Number(example.score.toFixed(4)),
        aceptado: example.aceptado,
        costSignals: example.costSignals,
        costInfluence: example.costInfluence,
      })),
      proyecto: persisted,
      costos,
      trainingExampleId: training.id,
    };
  }

  async buscarEjemplosSimilares(
    input: Record<string, unknown>,
    precomputedEmbedding?: number[],
  ) {
    const inputEmbedding = precomputedEmbedding || (await this.generarEmbedding(input));
    const inputContext = this.buildSimilarityContext(input);
    const examples = await this.prisma.trainingExample.findMany({
      where: {
        OR: [{ aceptado: true }, { aceptado: null }],
      },
      orderBy: { createdAt: 'desc' },
      take: 120,
    });

    const enriched = await Promise.all(
      examples.map(async (example) => {
        const exampleEmbedding =
          example.embedding.length > 0
            ? example.embedding
            : await this.backfillTrainingExampleEmbedding(example);
        const exampleContext = this.buildSimilarityContext(example.input as Record<string, unknown>);

        return {
          ...example,
          score: this.calculateHybridSimilarity(inputContext, exampleContext, inputEmbedding, exampleEmbedding),
          costSignals: this.explainSimilaritySignals(inputContext, exampleContext),
        };
      }),
    );

    return enriched
      .sort((left, right) => right.score - left.score)
      .slice(0, 5);
  }

  async generarEmbedding(input: Record<string, unknown>) {
    const serialized = this.serializeForEmbedding(input);
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');

    if (apiKey) {
      try {
        const response = await fetch('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: this.configService.get<string>('OPENAI_EMBEDDING_MODEL') || 'text-embedding-3-small',
            input: serialized,
          }),
        });

        if (!response.ok) {
          throw new Error(`Embedding failed: ${response.status} ${await response.text()}`);
        }

        const payload = (await response.json()) as { data?: Array<{ embedding?: number[] }> };
        const embedding = payload.data?.[0]?.embedding;
        if (embedding?.length) {
          return embedding;
        }
      } catch (error) {
        this.logger.warn(
          `No fue posible generar embedding OpenAI. Se usa embedding local. ${error instanceof Error ? error.message : 'Error desconocido'}`,
        );
      }
    }

    return this.generateLocalEmbedding(serialized);
  }

  async guardarEjemplo(
    input: Record<string, unknown>,
    output: Record<string, unknown>,
    aceptado: boolean | null,
    precomputedEmbedding?: number[],
  ) {
    const embedding = precomputedEmbedding || (await this.generarEmbedding(input));
    return this.prisma.trainingExample.create({
      data: {
        input: input as Prisma.InputJsonValue,
        output: output as Prisma.InputJsonValue,
        embedding,
        aceptado,
      },
    });
  }

  async convertProyectoToQuotation(
    proyectoId: string,
    input: ConvertirProyectoQuotationDto,
    actorUserId?: string,
  ) {
    const proyecto = await this.requireProyecto(proyectoId);
    const currency = input.currency || 'MXN';
    const matchedItems = await this.buildQuotationItemsFromProyecto(proyecto, currency);
    const unmatchedComponents = this.collectUnmatchedComponents(proyecto, matchedItems.matchedComponentKeys);
    const commercialSections = this.buildCommercialSectionsForQuotation(proyecto, unmatchedComponents);
    const quotation = await this.quotationsService.createQuotation(
      {
        clientId: input.clientId,
        title: input.title?.trim() || proyecto.nombre,
        coverTitle: proyecto.nombre,
        executiveSummary: this.buildExecutiveSummary(proyecto),
        serviceType: 'Proyecto de ingeniería',
        templateType: 'PROYECTO_IA',
        pricingRule: 'STANDARD',
        validityDays: 30,
        notes: `Cotización comercial generada desde Proyectos IA (${proyecto.id}).`,
        durationOfWork: this.estimateProjectDuration(proyecto.soluciones),
        commercialSections,
        currency,
        items: matchedItems.items,
      },
      actorUserId,
    );

    return {
      proyectoId: proyecto.id,
      quotationId: quotation.id,
      folio: quotation.folio,
      title: quotation.title,
      matchedItems: matchedItems.items.length,
      unmatchedComponents,
    };
  }

  async generateProyectoPdf(proyectoId: string) {
    const proyecto = await this.requireProyecto(proyectoId);
    const total = proyecto.soluciones.reduce(
      (solutionSum, solution) =>
        solutionSum +
        solution.componentes.reduce(
          (componentSum, component) =>
            componentSum + Number(component.costoBase || 0) * Number(component.cantidad || 1),
          0,
        ),
      0,
    );

    const pdf = await this.pdfService.renderProjectPdf({
      projectId: proyecto.id,
      issueDate: this.formatPdfDate(proyecto.createdAt),
      project: {
        name: proyecto.nombre,
        client: proyecto.cliente,
        sector: proyecto.sector,
        complexity: proyecto.complejidad,
        description: proyecto.descripcion,
        total,
        currency: 'MXN',
      },
      solutions: proyecto.soluciones.map((solution) => ({
        type: solution.tipo,
        includes: [
          solution.incluyeIngenieria ? 'Ingeniería' : null,
          solution.incluyeInstalacion ? 'Instalación' : null,
          solution.incluyePuestaMarcha ? 'Puesta en marcha' : null,
          solution.incluyeMantenimiento ? 'Mantenimiento' : null,
        ].filter((entry): entry is string => Boolean(entry)),
        components: solution.componentes.map((component) => ({
          type: component.tipo,
          name: component.nombre,
          brand: component.marca || undefined,
          category: component.categoria,
          cost: Number(component.costoBase) * Number(component.cantidad || 1),
        })),
      })),
    });

    return {
      fileName: `${this.slugify(proyecto.nombre)}.pdf`,
      file: Buffer.from(pdf).toString('base64'),
    };
  }

  private async persistProyecto(
    input: ReturnType<AiProyectosService['normalizeProjectInput']>,
    generated: ProyectoGenerado,
    costos: CostosDinamicos,
  ) {
    const totalComponentes = generated.soluciones.reduce(
      (sum, solucion) => sum + solucion.componentes.length,
      0,
    );
    const complejidad =
      input.condiciones.complejidad ||
      input.nivelComplejidad ||
      this.inferComplexity(input.descripcion, generated.soluciones.length, totalComponentes).toLowerCase();

    return this.prisma.proyecto.create({
      data: {
        nombre: input.nombre || generated.proyecto,
        cliente: input.cliente,
        sector: input.sector,
        descripcion: input.descripcion,
        complejidad,
        zona: input.condiciones.zona,
        urgencia: input.condiciones.urgencia,
        costoBaseMaterial: costos.materiales,
        costoManoObra: costos.mano_obra,
        factorComplejidad: costos.factores.complejidad,
        factorZona: costos.factores.zona,
        factorUrgencia: costos.factores.urgencia,
        margen: costos.margen,
        totalFinal: costos.total_final,
        soluciones: {
          create: generated.soluciones.map((solucion) => ({
            tipo: solucion.tipo,
            incluyeIngenieria: solucion.incluyeIngenieria,
            incluyeInstalacion: solucion.incluyeInstalacion,
            incluyePuestaMarcha: solucion.incluyePuestaMarcha,
            incluyeMantenimiento: solucion.incluyeMantenimiento,
            componentes: {
              create: solucion.componentes.map((component) => ({
                tipo: component.tipo,
                nombre: component.nombre,
                marca: component.marca || null,
                categoria: component.categoria,
                costoBase: component.costoBase,
                cantidad: component.cantidad,
              })),
            },
          })),
        },
      },
      include: {
        soluciones: {
          include: {
            componentes: true,
          },
        },
      },
    });
  }

  private async requireProyecto(proyectoId: string) {
    const proyecto = await this.prisma.proyecto.findUnique({
      where: { id: proyectoId },
      include: {
        soluciones: {
          include: {
            componentes: true,
          },
        },
      },
    });

    if (!proyecto) {
      throw new NotFoundException('Proyecto no encontrado.');
    }

    return proyecto;
  }

  private normalizeProjectInput(input: GenerarProyectoDto) {
    const descripcion = input.descripcion?.trim();
    const sector = input.sector?.trim();

    if (!descripcion || !sector) {
      throw new BadRequestException('descripcion y sector son obligatorios.');
    }

    return {
      nombre: input.nombre?.trim() || '',
      cliente: input.cliente?.trim() || 'Cliente por definir',
      sector,
      descripcion,
      nivelComplejidad: input.nivelComplejidad?.trim() || '',
      condiciones: {
        complejidad: input.condiciones?.complejidad || 'medio',
        zona: input.condiciones?.zona || 'urbano',
        urgencia: input.condiciones?.urgencia || 'normal',
        margen: typeof input.condiciones?.margen === 'number' ? input.condiciones.margen : undefined,
      },
    };
  }

  private async generateWithOpenAi(
    input: ReturnType<AiProyectosService['normalizeProjectInput']>,
    similares: Array<TrainingExample & { score: number }>,
    catalogoIndustrial: string,
  ): Promise<ProyectoGenerado> {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY no configurada.');
    }

    const model = this.configService.get<string>('OPENAI_AI_PROJECTS_MODEL') || 'gpt-4.1-mini';
    const prompt = this.buildDynamicPrompt(input, similares, catalogoIndustrial);

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: 'system',
            content: [
              {
                type: 'input_text',
                text: prompt,
              },
            ],
          },
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: JSON.stringify(input, null, 2),
              },
            ],
          },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'ai_proyecto',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                proyecto: { type: 'string' },
                soluciones: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      tipo: { type: 'string' },
                      incluyeIngenieria: { type: 'boolean' },
                      incluyeInstalacion: { type: 'boolean' },
                      incluyePuestaMarcha: { type: 'boolean' },
                      incluyeMantenimiento: { type: 'boolean' },
                      componentes: {
                        type: 'array',
                        items: {
                          type: 'object',
                          additionalProperties: false,
                          properties: {
                            tipo: { type: 'string' },
                            nombre: { type: 'string' },
                            marca: { type: ['string', 'null'] },
                            categoria: { type: 'string' },
                            costoBase: { type: 'number' },
                            cantidad: { type: 'number' },
                          },
                          required: ['tipo', 'nombre', 'marca', 'categoria', 'costoBase', 'cantidad'],
                        },
                      },
                    },
                    required: [
                      'tipo',
                      'incluyeIngenieria',
                      'incluyeInstalacion',
                      'incluyePuestaMarcha',
                      'incluyeMantenimiento',
                      'componentes',
                    ],
                  },
                },
              },
              required: ['proyecto', 'soluciones'],
            },
          },
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI proyecto failed: ${response.status} ${await response.text()}`);
    }

    const payload = (await response.json()) as { output_text?: string };
    return this.validateProyectoGenerado(JSON.parse(payload.output_text || '{}'));
  }

  private generateWithRules(
    input: ReturnType<AiProyectosService['normalizeProjectInput']>,
    similares: Array<TrainingExample & { score: number }>,
    catalogoIndustrial: string,
  ): ProyectoGenerado {
    const normalized = input.descripcion.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const components = this.extractCatalogComponents(catalogoIndustrial);
    const selected: ProyectoGenerado['soluciones'] = [];

    if (/distribucion|tablero|nave|linea de produccion|cableado/.test(normalized)) {
      selected.push({
        tipo: 'distribucion electrica',
        incluyeIngenieria: true,
        incluyeInstalacion: true,
        incluyePuestaMarcha: true,
        incluyeMantenimiento: true,
        componentes: [
          this.pickComponent(components, 'BREAKERS', 'Schneider', 'material', 'proteccion', 2500),
          this.pickComponent(components, 'CABLEADO', 'Viakon', 'material', 'conductores', 1800),
          { tipo: 'servicio', nombre: 'Ingenieria e instalacion de distribucion electrica', categoria: 'instalacion', costoBase: 40, cantidad: 1 },
        ],
      });
    }

    if (/automatizacion|plc|sensores|variadores|control de motores/.test(normalized)) {
      selected.push({
        tipo: 'automatizacion',
        incluyeIngenieria: true,
        incluyeInstalacion: true,
        incluyePuestaMarcha: true,
        incluyeMantenimiento: true,
        componentes: [
          this.pickComponent(components, 'AUTOMATIZACION', 'Siemens', 'material', 'control', 3500),
          { tipo: 'material', nombre: 'Variador de frecuencia ABB', marca: 'ABB', categoria: 'control', costoBase: 1800, cantidad: 1 },
          { tipo: 'servicio', nombre: 'Programacion, integracion y puesta en marcha', categoria: 'ingenieria', costoBase: 36, cantidad: 1 },
        ],
      });
    }

    if (/iluminacion|led|luminarias/.test(normalized)) {
      selected.push({
        tipo: 'iluminacion',
        incluyeIngenieria: true,
        incluyeInstalacion: true,
        incluyePuestaMarcha: true,
        incluyeMantenimiento: false,
        componentes: [
          { tipo: 'material', nombre: 'Luminarias LED industriales', marca: 'Philips', categoria: 'iluminacion', costoBase: 2500, cantidad: 1 },
          { tipo: 'servicio', nombre: 'Montaje e instalacion de iluminacion', categoria: 'instalacion', costoBase: 16, cantidad: 1 },
        ],
      });
    }

    if (/subestacion|media tension|ups|emergencia|factor de potencia|calidad de energia/.test(normalized)) {
      selected.push({
        tipo: /subestacion/.test(normalized) ? 'subestacion' : /ups|emergencia/.test(normalized) ? 'energia critica' : 'calidad energia',
        incluyeIngenieria: true,
        incluyeInstalacion: !/mantenimiento/.test(normalized),
        incluyePuestaMarcha: true,
        incluyeMantenimiento: true,
        componentes: [
          this.pickComponent(components, 'PROTECCION', 'Eaton', 'material', 'proteccion', 1500),
          { tipo: 'servicio', nombre: 'Ingenieria, pruebas y puesta en marcha especializada', categoria: 'ingenieria', costoBase: 28, cantidad: 1 },
        ],
      });
    }

    if (!selected.length && similares.length) {
      const example = similares[0];
      const parsed = this.validateProyectoGenerado(example.output as Record<string, unknown>);
      return parsed;
    }

    if (!selected.length) {
      selected.push({
        tipo: 'distribucion electrica',
        incluyeIngenieria: true,
        incluyeInstalacion: true,
        incluyePuestaMarcha: true,
        incluyeMantenimiento: true,
        componentes: [
          this.pickComponent(components, 'BREAKERS', 'Siemens', 'material', 'proteccion', 600),
          this.pickComponent(components, 'CABLEADO', 'Condumex', 'material', 'conductores', 1200),
          { tipo: 'servicio', nombre: 'Ingenieria, instalacion y puesta en marcha', categoria: 'instalacion', costoBase: 30, cantidad: 1 },
        ],
      });
    }

    return {
      proyecto: this.inferProjectName(normalized),
      soluciones: selected,
    };
  }

  private buildDynamicPrompt(
    input: ReturnType<AiProyectosService['normalizeProjectInput']>,
    similares: Array<TrainingExample & { score: number }>,
    catalogoIndustrial: string,
  ) {
    const ejemplos = similares
      .slice(0, 5)
      .map(
        (example, index) =>
          `Ejemplo ${index + 1}:\nInput:\n${JSON.stringify(example.input, null, 2)}\nOutput:\n${JSON.stringify(example.output, null, 2)}`,
      )
      .join('\n\n');

    return [
      'Eres un asistente senior de proyectos de ingenieria electrica industrial.',
      'Debes generar un proyecto completo, no solo un servicio aislado.',
      'Incluye soluciones completas de ingenieria electrica con materiales, marcas reales, instalacion, puesta en marcha y mantenimiento cuando aplique.',
      'Cada componente debe incluir costoBase y cantidad. En materiales, costoBase representa costo unitario. En servicios, costoBase puede representar horas base estimadas.',
      'Usa solo JSON valido.',
      'Estructura requerida:',
      '- proyecto',
      '- soluciones[]',
      '- soluciones[].componentes[]',
      'Cada componente debe incluir tipo, nombre, marca, categoria, costoBase y cantidad.',
      `Catalogo industrial disponible:\n${catalogoIndustrial}`,
      ejemplos ? `Ejemplos similares:\n${ejemplos}` : 'No hay ejemplos similares disponibles.',
      `Input a resolver:\n${JSON.stringify(input, null, 2)}`,
    ].join('\n\n');
  }

  private async buildIndustrialCatalogSnapshot() {
    const supplies = await this.prisma.supply.findMany({
      where: {
        deletedAt: null,
        category: {
          code: {
            in: ['BREAKERS', 'CABLEADO', 'AUTOMATIZACION', 'PROTECCION'],
          },
        },
      },
      include: {
        category: true,
      },
      orderBy: [{ category: { code: 'asc' } }, { name: 'asc' }],
    });

    const materials = await this.prisma.material.findMany({
      orderBy: [{ categoria: 'asc' }, { nombre: 'asc' }],
    }).catch(() => []);

    return [
      ...supplies.map((supply) => `${supply.category.code} | ${supply.name} | ${supply.description || ''}`),
      ...materials.map((material) => `${material.categoria} | ${material.nombre} | ${material.marca}`),
    ].join('\n');
  }

  private extractCatalogComponents(snapshot: string) {
    return snapshot
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [category, name] = line.split('|').map((item) => item.trim());
        const brand = this.extractBrandFromName(name || '');
        return { category: category || '', name: name || '', brand };
      });
  }

  private pickComponent(
    components: Array<{ category: string; name: string; brand: string | null }>,
    category: string,
    preferredBrand: string,
    tipo: 'servicio' | 'material',
    categoria: string,
    fallbackCost: number,
  ) {
    const component = components.find(
      (entry) => entry.category === category && (!preferredBrand || entry.brand?.toLowerCase() === preferredBrand.toLowerCase()),
    ) || components.find((entry) => entry.category === category);

    return {
      tipo,
      nombre: component?.name || `${categoria} industrial`,
      marca: component?.brand || preferredBrand || null,
      categoria,
      costoBase: fallbackCost,
      cantidad: 1,
    };
  }

  private extractBrandFromName(name: string) {
    const knownBrands = ['Schneider', 'Siemens', 'Eaton', 'Viakon', 'Condumex', 'ABB', 'Littelfuse'];
    return knownBrands.find((brand) => name.toLowerCase().includes(brand.toLowerCase())) || null;
  }

  private inferProjectName(normalizedDescription: string) {
    if (normalizedDescription.includes('automat')) {
      return 'Proyecto integral de automatizacion industrial';
    }
    if (normalizedDescription.includes('ilumin')) {
      return 'Proyecto integral de iluminacion';
    }
    if (normalizedDescription.includes('subestacion')) {
      return 'Proyecto de subestacion electrica';
    }
    if (normalizedDescription.includes('ups') || normalizedDescription.includes('emergencia')) {
      return 'Proyecto de energia critica';
    }
    return 'Proyecto integral de ingenieria electrica';
  }

  private inferComplexity(description: string, soluciones: number, componentes: number) {
    const normalized = description.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const score =
      (soluciones >= 2 ? 2 : 1) +
      (componentes >= 5 ? 2 : 1) +
      (/subestacion|media tension|critico|redundante|lineas de produccion|multiples/.test(normalized) ? 2 : 0);

    if (score >= 5) {
      return 'ALTA';
    }
    if (score >= 3) {
      return 'MEDIA';
    }
    return 'BAJA';
  }

  private async calcularCosto(
    proyecto: ProyectoGenerado,
    condiciones: {
      complejidad: string;
      zona: string;
      urgencia: string;
      margen?: number;
    },
  ): Promise<CostosDinamicos> {
    const materiales = proyecto.soluciones.reduce(
      (solutionSum, solution) =>
        solutionSum +
        solution.componentes
          .filter((component) => component.tipo === 'material')
          .reduce(
            (componentSum, component) => componentSum + component.costoBase * component.cantidad,
            0,
          ),
      0,
    );

    const manoObra = await this.calculateLaborCost(proyecto);
    const factorComplejidad = await this.resolveCostFactor('complejidad', condiciones.complejidad, 1.2);
    const factorZona = await this.resolveCostFactor('zona', condiciones.zona, 1);
    const factorUrgencia = await this.resolveCostFactor('urgencia', condiciones.urgencia, 1);
    const margen = this.resolveMargin(condiciones);
    const costoBase = materiales + manoObra;
    const totalFinal = Number(
      (
        costoBase *
        factorComplejidad *
        factorZona *
        factorUrgencia *
        margen
      ).toFixed(2),
    );

    return {
      costo_base: Number(costoBase.toFixed(2)),
      materiales: Number(materiales.toFixed(2)),
      mano_obra: Number(manoObra.toFixed(2)),
      factores: {
        complejidad: factorComplejidad,
        zona: factorZona,
        urgencia: factorUrgencia,
      },
      margen,
      total_final: totalFinal,
    };
  }

  private async calculateLaborCost(proyecto: ProyectoGenerado) {
    const manoObraCatalog = await this.prisma.manoObra.findMany().catch(() => []);
    const rateMap = new Map(
      manoObraCatalog.map((entry) => [this.normalizeForMatch(entry.tipo), Number(entry.costoHora)]),
    );

    return proyecto.soluciones.reduce(
      (solutionSum, solution) =>
        solutionSum +
        solution.componentes
          .filter((component) => component.tipo === 'servicio')
          .reduce((componentSum, component) => {
            const rate = this.resolveLaborRate(component.categoria, rateMap);
            const treatAsSubtotal = component.costoBase > 250;
            const lineTotal = treatAsSubtotal
              ? component.costoBase * component.cantidad
              : component.costoBase * rate * component.cantidad;
            return componentSum + lineTotal;
          }, 0),
      0,
    );
  }

  private resolveLaborRate(categoria: string, rates: Map<string, number>) {
    const normalized = this.normalizeForMatch(categoria);
    return (
      rates.get(normalized) ||
      rates.get('ingenieria') ||
      (normalized.includes('instal') ? 85 : normalized.includes('mantenimiento') ? 75 : 95)
    );
  }

  private async resolveCostFactor(tipo: string, nombre: string, fallback: number) {
    const factor = await this.prisma.factorCosto.findUnique({
      where: {
        tipo_nombre: {
          tipo,
          nombre: this.normalizeForMatch(nombre),
        },
      },
    }).catch(() => null);

    return factor ? Number(factor.valor) : fallback;
  }

  private resolveMargin(condiciones: {
    complejidad: string;
    margen?: number;
  }) {
    if (typeof condiciones.margen === 'number') {
      return Math.min(1.4, Math.max(1.2, Number(condiciones.margen.toFixed(2))));
    }

    const normalizedComplexity = this.normalizeForMatch(condiciones.complejidad);
    if (normalizedComplexity === 'alto' || normalizedComplexity === 'alta') {
      return 1.4;
    }
    if (normalizedComplexity === 'bajo' || normalizedComplexity === 'baja') {
      return 1.2;
    }
    return 1.3;
  }

  private async buildQuotationItemsFromProyecto(
    proyecto: Proyecto & { soluciones: Array<Solucion & { componentes: Array<{ id: string; tipo: string; nombre: string; marca: string | null; categoria: string; costoBase: Prisma.Decimal; cantidad: Prisma.Decimal; createdAt: Date }> }> },
    currency: 'MXN' | 'USD',
  ) {
    const supplies = await this.prisma.supply.findMany({
      where: { deletedAt: null },
      include: {
        category: true,
        pricingProfiles: {
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        },
      },
    });

    const items: Array<{ serviceId: string; pricingProfileId: string; quantity: number }> = [];
    const matchedComponentKeys = new Set<string>();

    for (const solution of proyecto.soluciones) {
      for (const component of solution.componentes) {
        const match = this.findBestSupplyMatch(component.nombre, component.marca, supplies);
        if (!match || !match.pricingProfile) {
          continue;
        }

        matchedComponentKeys.add(component.id);
        items.push({
          serviceId: match.supply.id,
          pricingProfileId: match.pricingProfile.id,
          quantity: 1,
        });
      }
    }

    return {
      currency,
      items,
      matchedComponentKeys,
    };
  }

  private findBestSupplyMatch(
    componentName: string,
    brand: string | null,
    supplies: Array<{
      id: string;
      name: string;
      description: string | null;
      category: { name: string; code: string };
      pricingProfiles: Array<{
        id: string;
        name: string;
        mxnPrice: Prisma.Decimal | null;
        usdPrice: Prisma.Decimal | null;
      }>;
    }>,
  ) {
    const normalizedComponent = this.normalizeForMatch(componentName);
    const brandNormalized = this.normalizeForMatch(brand || '');
    let best:
      | {
          score: number;
          supply: (typeof supplies)[number];
          pricingProfile: (typeof supplies)[number]['pricingProfiles'][number] | null;
        }
      | undefined;

    for (const supply of supplies) {
      const haystack = this.normalizeForMatch(
        [supply.name, supply.description || '', supply.category.name, supply.category.code].join(' '),
      );
      const score = this.scoreMatch(normalizedComponent, haystack, brandNormalized);
      if (score < 0.42) {
        continue;
      }

      const pricingProfile = supply.pricingProfiles[0] || null;
      if (!best || score > best.score) {
        best = { score, supply, pricingProfile };
      }
    }

    return best;
  }

  private collectUnmatchedComponents(
    proyecto: Proyecto & { soluciones: Array<Solucion & { componentes: Array<{ id: string; tipo: string; nombre: string; marca: string | null; categoria: string; costoBase: Prisma.Decimal; cantidad: Prisma.Decimal }> }> },
    matchedComponentKeys: Set<string>,
  ) {
    return proyecto.soluciones.flatMap((solution) =>
      solution.componentes
        .filter((component) => !matchedComponentKeys.has(component.id))
        .map((component) =>
          [
            component.nombre,
            component.marca ? `Marca ${component.marca}` : null,
            `${component.categoria}`,
            `estimado ${Number(component.costoBase).toFixed(2)} base x ${Number(component.cantidad).toFixed(2)}`,
          ]
            .filter(Boolean)
            .join(' · '),
        ),
    );
  }

  private buildCommercialSectionsForQuotation(
    proyecto: Proyecto & { soluciones: Array<Solucion & { componentes: Array<{ id: string; tipo: string; nombre: string; marca: string | null; categoria: string; costoBase: Prisma.Decimal; cantidad: Prisma.Decimal }> }> },
    unmatchedComponents: string[],
  ) {
    const sections = [
      {
        title: 'Alcance del proyecto',
        content: proyecto.descripcion,
      },
      {
        title: 'Soluciones incluidas',
        content: proyecto.soluciones
          .map((solution) => {
            const incluye = [
              solution.incluyeIngenieria ? 'ingeniería' : null,
              solution.incluyeInstalacion ? 'instalación' : null,
              solution.incluyePuestaMarcha ? 'puesta en marcha' : null,
              solution.incluyeMantenimiento ? 'mantenimiento' : null,
            ]
              .filter(Boolean)
              .join(', ');

            return `${solution.tipo}: ${incluye || 'alcance por definir'}`;
          })
          .join('\n'),
      },
    ];

    if (unmatchedComponents.length) {
      sections.push({
        title: 'Componentes de ingeniería por validar',
        content: unmatchedComponents.join('\n'),
      });
    }

    return sections;
  }

  private buildExecutiveSummary(
    proyecto: Proyecto & { soluciones: Array<Solucion & { componentes: Array<{ costoBase: Prisma.Decimal; cantidad: Prisma.Decimal }> }> },
  ) {
    const total = proyecto.soluciones.reduce(
      (solutionSum, solution) =>
        solutionSum +
        solution.componentes.reduce(
          (componentSum, component) =>
            componentSum + Number(component.costoBase || 0) * Number(component.cantidad || 1),
          0,
        ),
      0,
    );

    return `Proyecto ${proyecto.sector} para ${proyecto.cliente} con ${proyecto.soluciones.length} solución(es) de ingeniería. Estimado técnico base ${total.toFixed(2)} MXN.`;
  }

  private estimateProjectDuration(soluciones: Array<Solucion & { componentes: Array<{ tipo: string }> }>) {
    const units = soluciones.reduce(
      (sum, solution) => sum + solution.componentes.filter((component) => component.tipo === 'servicio').length,
      0,
    );

    if (!units) {
      return 'Duración por definir durante ingeniería de detalle.';
    }

    return `${Math.max(3, units * 2)} días estimados considerando ingeniería, suministro y puesta en marcha.`;
  }

  private normalizeForMatch(value: string) {
    return normalizeForMatching(value);
  }

  private scoreMatch(component: string, candidate: string, brand: string) {
    return tokenOverlapScore(component, candidate, brand);
  }

  private formatPdfDate(value: Date) {
    return new Intl.DateTimeFormat('es-MX', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'America/Mexico_City',
    }).format(value);
  }

  private slugify(value: string) {
    return this.normalizeForMatch(value).replace(/\s+/g, '-');
  }

  private validateProyectoGenerado(value: Record<string, unknown>): ProyectoGenerado {
    if (!value || typeof value !== 'object') {
      throw new InternalServerErrorException('La respuesta de IA no devolvio un objeto valido.');
    }

    const proyecto = typeof value.proyecto === 'string' ? value.proyecto.trim() : '';
    const soluciones = Array.isArray(value.soluciones) ? value.soluciones : [];

    if (!proyecto || !soluciones.length) {
      throw new InternalServerErrorException('La respuesta de IA no contiene proyecto o soluciones validas.');
    }

    return {
      proyecto,
      soluciones: soluciones.map((solution) => {
        const current = solution as Record<string, unknown>;
        return {
          tipo: typeof current.tipo === 'string' ? current.tipo : 'distribucion electrica',
          incluyeIngenieria: Boolean(current.incluyeIngenieria),
          incluyeInstalacion: Boolean(current.incluyeInstalacion),
          incluyePuestaMarcha: Boolean(current.incluyePuestaMarcha),
          incluyeMantenimiento: Boolean(current.incluyeMantenimiento),
          componentes: Array.isArray(current.componentes)
            ? current.componentes.map((component) => {
                const currentComponent = component as Record<string, unknown>;
                return {
                  tipo: currentComponent.tipo === 'servicio' ? 'servicio' : 'material',
                  nombre: typeof currentComponent.nombre === 'string' ? currentComponent.nombre : 'Componente',
                  marca:
                    typeof currentComponent.marca === 'string' && currentComponent.marca.trim().length
                      ? currentComponent.marca
                      : null,
                  categoria:
                    typeof currentComponent.categoria === 'string' ? currentComponent.categoria : 'general',
                  costoBase:
                    typeof currentComponent.costoBase === 'number'
                      ? currentComponent.costoBase
                      : Number(currentComponent.costo) || 0,
                  cantidad: Number(currentComponent.cantidad) || 1,
                };
              })
            : [],
        };
      }),
    };
  }

  private async backfillTrainingExampleEmbedding(example: TrainingExample) {
    const embedding = await this.generarEmbedding(example.input as Record<string, unknown>);
    await this.prisma.trainingExample.update({
      where: { id: example.id },
      data: { embedding },
    });
    return embedding;
  }

  private serializeForEmbedding(input: Record<string, unknown>) {
    return JSON.stringify(input, Object.keys(input).sort());
  }

  private buildSimilarityContext(input: Record<string, unknown>) {
    const sector = typeof input.sector === 'string' ? this.normalizeForMatch(input.sector) : '';
    const descriptionSource =
      typeof input.descripcion === 'string'
        ? input.descripcion
        : typeof input.descripcion_trabajo === 'string'
          ? input.descripcion_trabajo
          : '';
    const description = this.normalizeForMatch(descriptionSource);
    const combined = [sector, description].filter(Boolean).join(' ').trim();
    const keywords = new Set(combined.split(' ').filter((token) => token.length > 2));
    const classes = this.inferProjectClasses(combined, sector);

    return {
      sector,
      description,
      keywords,
      classes,
    };
  }

  private inferProjectClasses(description: string, sector: string) {
    const classes = new Set<string>();
    const source = `${sector} ${description}`;

    if (/industrial|manufactura|produccion|planta|nave/.test(source)) {
      classes.add('industrial');
    }
    if (/hospital|salud|quir|medic|clinica/.test(source)) {
      classes.add('salud');
      classes.add('infraestructura_critica');
    }
    if (/data center|datacenter|tier iii|tier iv|servidor|tecnologia/.test(source)) {
      classes.add('data_center');
      classes.add('infraestructura_critica');
    }
    if (/aeropuerto|terminal|pista|infraestructura/.test(source)) {
      classes.add('infraestructura');
    }
    if (/subestacion|media tension|transformador|celda/.test(source)) {
      classes.add('subestacion');
    }
    if (/ups|respaldo|redundante|emergencia|critica|critico/.test(source)) {
      classes.add('energia_critica');
      classes.add('infraestructura_critica');
    }
    if (/automatizacion|plc|scada|robotiz|control/.test(source)) {
      classes.add('automatizacion');
    }
    if (/distribucion|tablero|alimentador|cableado/.test(source)) {
      classes.add('distribucion');
    }
    if (/iluminacion|led|luminaria/.test(source)) {
      classes.add('iluminacion');
    }
    if (/factor de potencia|calidad de energia|capacitores|monitoreo/.test(source)) {
      classes.add('calidad_energia');
    }

    return classes;
  }

  private calculateHybridSimilarity(
    inputContext: ReturnType<AiProyectosService['buildSimilarityContext']>,
    exampleContext: ReturnType<AiProyectosService['buildSimilarityContext']>,
    inputEmbedding: number[],
    exampleEmbedding: number[],
  ) {
    const semanticScore = this.cosineSimilarity(inputEmbedding, exampleEmbedding);
    const keywordScore = this.keywordOverlapScore(inputContext.keywords, exampleContext.keywords);
    const sectorScore =
      inputContext.sector && exampleContext.sector && inputContext.sector === exampleContext.sector ? 1 : 0;
    const classScore = this.keywordOverlapScore(inputContext.classes, exampleContext.classes);
    const criticalBoost =
      inputContext.classes.has('infraestructura_critica') &&
      exampleContext.classes.has('infraestructura_critica')
        ? 0.08
        : 0;

    const score =
      semanticScore * 0.5 +
      keywordScore * 0.22 +
      sectorScore * 0.18 +
      classScore * 0.1 +
      criticalBoost;

    return Math.min(1, Number(score.toFixed(6)));
  }

  private keywordOverlapScore(left: Set<string>, right: Set<string>) {
    if (!left.size || !right.size) {
      return 0;
    }

    const overlap = [...left].filter((token) => right.has(token)).length;
    return overlap / Math.max(Math.min(left.size, right.size), 1);
  }

  private explainSimilaritySignals(
    inputContext: ReturnType<AiProyectosService['buildSimilarityContext']>,
    exampleContext: ReturnType<AiProyectosService['buildSimilarityContext']>,
  ) {
    const signals: string[] = [];

    if (inputContext.sector && inputContext.sector === exampleContext.sector) {
      signals.push(`sector:${inputContext.sector}`);
    }

    const sharedClasses = [...inputContext.classes].filter((entry) => exampleContext.classes.has(entry));
    if (sharedClasses.length) {
      signals.push(...sharedClasses.map((entry) => `clase:${entry}`));
    }

    const sharedKeywords = [...inputContext.keywords]
      .filter((entry) => exampleContext.keywords.has(entry))
      .slice(0, 4);
    if (sharedKeywords.length) {
      signals.push(...sharedKeywords.map((entry) => `keyword:${entry}`));
    }

    return signals;
  }

  private withCostInfluence<T extends { score: number }>(examples: T[]) {
    const totalScore = examples.reduce((sum, example) => sum + Math.max(example.score, 0), 0);

    return examples.map((example) => ({
      ...example,
      costInfluence:
        totalScore > 0
          ? Number((((Math.max(example.score, 0) / totalScore) * 100)).toFixed(1))
          : 0,
    }));
  }

  private generateLocalEmbedding(value: string) {
    const vector = new Array<number>(64).fill(0);
    const tokens = value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean);

    for (const token of tokens) {
      let hash = 0;
      for (let index = 0; index < token.length; index += 1) {
        hash = (hash * 31 + token.charCodeAt(index)) % vector.length;
      }
      vector[hash] += 1;
    }

    const magnitude = Math.sqrt(vector.reduce((sum, current) => sum + current * current, 0)) || 1;
    return vector.map((valueAtIndex) => Number((valueAtIndex / magnitude).toFixed(6)));
  }

  private cosineSimilarity(left: number[], right: number[]) {
    if (!left.length || !right.length) {
      return 0;
    }

    const size = Math.min(left.length, right.length);
    let dot = 0;
    let leftMagnitude = 0;
    let rightMagnitude = 0;

    for (let index = 0; index < size; index += 1) {
      dot += left[index] * right[index];
      leftMagnitude += left[index] * left[index];
      rightMagnitude += right[index] * right[index];
    }

    const denominator = Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude) || 1;
    return dot / denominator;
  }
}
