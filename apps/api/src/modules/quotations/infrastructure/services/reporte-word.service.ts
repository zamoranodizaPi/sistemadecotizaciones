import { Injectable, NotFoundException } from '@nestjs/common';
import { ActivityType } from '@prisma/client';
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { PrismaService } from '../../../../shared/infrastructure/prisma.service';
import { CompanyProfileService } from '../../../company-profile/infrastructure/services/company-profile.service';

@Injectable()
export class ReporteWordService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly companyProfileService: CompanyProfileService,
  ) {}

  async generarCotizacionWord(cotizacionId: string, actorUserId?: string) {
    const quotation = await this.prisma.quotation.findUnique({
      where: { id: cotizacionId },
      include: {
        client: true,
        items: true,
        createdBy: true,
        approvedBy: true,
      },
    });

    if (!quotation || quotation.deletedAt) {
      throw new NotFoundException('Cotización no encontrada');
    }

    const company = await this.companyProfileService.getProfile().catch(() => null);
    const logoAsset = this.loadLogoBuffer(company?.logoUrl);
    const companyName = company?.legalName || 'SISTEMAS ELECTRICOS ZARAGOZA';
    const companyShortName =
      company?.brandShortName || company?.commercialName || 'SIEZA';
    const commercialTitle = quotation.coverTitle?.trim() || quotation.title;
    const issueDate = quotation.createdAt;
    const validUntil =
      quotation.validUntil || new Date(quotation.createdAt.getTime() + 30 * 24 * 60 * 60 * 1000);
    const currency = quotation.currency || 'MXN';
    const finalChargeRate = Number(quotation.finalChargeRate || 16);
    const finalChargeLabel = Math.abs(finalChargeRate - 16) < 0.0001 ? 'IVA' : 'Utilidad';
    const visibleCommercialSections = this.getVisibleCommercialSections(
      Array.isArray(quotation.commercialSections)
        ? (quotation.commercialSections as Array<{ title: string; content: string }>)
        : [],
    );
    const orderedItems = this.orderQuotationItems(
      quotation.items.map((item) => ({
        partNumber: item.partNumber || 1,
        partQuantity: item.partQuantity || 1,
        serviceCode: item.supplyCode || undefined,
        serviceName: item.supplyName,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        totalPrice: Number(item.totalPrice),
      })),
    );
    const executiveSummary = quotation.executiveSummary?.trim();

    const doc = new Document({
      sections: [
        {
          properties: {},
          children: [
            this.buildHeaderTable({
              logoBuffer: logoAsset?.buffer || null,
              logoType: logoAsset?.type || 'png',
              companyName,
              companyShortName,
              clientName: quotation.client.legalName,
              projectName: commercialTitle,
              acceptedDate: issueDate,
              folio: quotation.folio,
            }),
            this.buildHeading('Cotización editable'),
            this.buildBodyParagraph(
              'Versión editable en Word de la cotización completa para ajustes manuales antes de su envío o revisión final.',
            ),
            this.buildQuotationSummaryTable({
              clientName: quotation.client.legalName,
              contactName: quotation.contactName || 'Sin contacto capturado',
              sellerName: quotation.createdBy.name || quotation.createdBy.email || companyShortName,
              issueDate,
              validUntil,
              folio: quotation.folio,
              commercialTitle,
            }),
            ...(executiveSummary
              ? [this.buildHeading('Resumen ejecutivo'), this.buildMultilineParagraph(executiveSummary)]
              : []),
            this.buildHeading('Conceptos de la cotización'),
            this.buildConceptTable(orderedItems, currency),
            this.buildHeading('Resumen económico'),
            this.buildQuotationTotalsTable({
              conceptsCount: orderedItems.length,
              subtotal: Number(quotation.subtotal),
              tax: Number(quotation.tax),
              total: Number(quotation.total),
              finalChargeLabel,
              finalChargeRate,
              currency,
            }),
            ...this.buildCommercialSectionsContent(visibleCommercialSections),
          ],
        },
      ],
    });

    const buffer = await Packer.toBuffer(doc);
    const fileName = `${quotation.folio}.docx`;
    const reportDir = resolve(process.cwd(), 'storage', 'quotation-reports', quotation.id);
    mkdirSync(reportDir, { recursive: true });
    const reportPath = resolve(reportDir, fileName);
    writeFileSync(reportPath, buffer);

    await this.adjuntarReporteACotizacion(cotizacionId, reportPath, fileName, actorUserId);

    return {
      fileName,
      filePath: reportPath,
      file: buffer.toString('base64'),
      generatedAt: new Date().toISOString(),
    };
  }

  async generarReporteSugeridoWord(cotizacionId: string, actorUserId?: string) {
    const quotation = await this.prisma.quotation.findUnique({
      where: { id: cotizacionId },
      include: {
        client: true,
        items: true,
        createdBy: true,
        approvedBy: true,
      },
    });

    if (!quotation || quotation.deletedAt) {
      throw new NotFoundException('Cotización no encontrada');
    }

    const company = await this.companyProfileService.getProfile().catch(() => null);
    const logoAsset = this.loadLogoBuffer(company?.logoUrl);
    const executiveSummary =
      quotation.executiveSummary?.trim() ||
      quotation.coverTitle?.trim() ||
      quotation.notes?.trim() ||
      `Proyecto ${quotation.title} para ${quotation.client.legalName}.`;
    const companyName = company?.legalName || 'SISTEMAS ELECTRICOS ZARAGOZA';
    const companyShortName = company?.brandShortName || company?.commercialName || 'SIEZA';
    const acceptedDate = quotation.acceptedAt || new Date();
    const materialCost = Number(quotation.subtotal);
    const laborCost = 0;
    const totalCost = Number(quotation.total);
    const activities = this.extractActivityLines(
      Array.isArray(quotation.commercialSections)
        ? (quotation.commercialSections as Array<{ title: string; content: string }>)
        : [],
      quotation.items.map((item) => item.supplyName),
    );
    const factorLines = [
      quotation.pricingRuleLabel || quotation.pricingRule
        ? `Regla comercial aplicada: ${quotation.pricingRuleLabel || quotation.pricingRule}`
        : 'Factores comerciales: no capturados en la cotización.',
      quotation.discountPercent
        ? `Descuento aplicado: ${Number(quotation.discountPercent).toFixed(2)}%`
        : 'Margen / descuento: pendiente de validación final.',
    ];

    const doc = new Document({
      sections: [
        {
          properties: {},
          children: [
            this.buildHeaderTable({
              logoBuffer: logoAsset?.buffer || null,
              logoType: logoAsset?.type || 'png',
              companyName,
              companyShortName,
              clientName: quotation.client.legalName,
              projectName: quotation.title,
              acceptedDate,
              folio: quotation.folio,
            }),
            this.buildHeading('Resumen ejecutivo'),
            this.buildBodyParagraph(executiveSummary),
            this.buildBodyParagraph(
              'Objetivo: ejecutar y documentar el alcance comercial aceptado, dejando trazabilidad clara de servicios, costos y espacios editables para evidencias y seguimiento operativo.',
            ),
            this.buildHeading('Servicios realizados'),
            ...this.buildServiceTables(activities, quotation.createdBy.name, companyShortName),
            this.buildHeading('Costos y cobro'),
            this.buildCostTable({
              materialCost,
              laborCost,
              totalCost,
              factorLines,
            }),
            this.buildHeading('Evidencias diarias'),
            ...this.buildEvidenceSections(activities),
            this.buildHeading('Observaciones finales'),
            this.buildBodyParagraph(
              'Espacio editable para registrar observaciones finales, hallazgos relevantes, recomendaciones y condiciones de entrega.',
            ),
            ...this.buildEditableLines(6),
            this.buildHeading('Firmas'),
            this.buildSignatureTable(companyName, quotation.client.legalName),
          ],
        },
      ],
    });

    const buffer = await Packer.toBuffer(doc);
    const fileName = `reporte-sugerido-${quotation.folio}.docx`;
    const reportDir = resolve(process.cwd(), 'storage', 'quotation-reports', quotation.id);
    mkdirSync(reportDir, { recursive: true });
    const reportPath = resolve(reportDir, fileName);
    writeFileSync(reportPath, buffer);

    await this.adjuntarReporteACotizacion(cotizacionId, reportPath, fileName, actorUserId);

    return {
      fileName,
      filePath: reportPath,
      file: buffer.toString('base64'),
      generatedAt: new Date().toISOString(),
    };
  }

  async adjuntarReporteACotizacion(
    cotizacionId: string,
    reportePath: string,
    fileName: string,
    actorUserId?: string,
  ) {
    return this.prisma.activity.create({
      data: {
        quotationId: cotizacionId,
        type: ActivityType.EDIT,
        description: 'Reporte Word sugerido generado automáticamente',
        userId: actorUserId,
        payload: {
          kind: 'word-report',
          fileName,
          filePath: reportePath,
          generatedAt: new Date().toISOString(),
        },
      },
    });
  }

  private buildHeaderTable(input: {
    logoBuffer: Buffer | null;
    logoType: 'png' | 'jpg';
    companyName: string;
    companyShortName: string;
    clientName: string;
    projectName: string;
    acceptedDate: Date;
    folio: string;
  }) {
    const leftChildren = input.logoBuffer
      ? [
          new Paragraph({
            children: [
              new ImageRun({
                data: input.logoBuffer,
                type: input.logoType,
                transformation: { width: 96, height: 96 },
              }),
            ],
          }),
        ]
      : [this.buildSmallLabel(input.companyShortName)];

    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.FIXED,
      borders: this.noBorders(),
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 18, type: WidthType.PERCENTAGE },
              borders: this.noBorders(),
              children: leftChildren,
            }),
            new TableCell({
              width: { size: 52, type: WidthType.PERCENTAGE },
              borders: this.noBorders(),
              children: [
                new Paragraph({
                  spacing: { after: 60 },
                  children: [new TextRun({ text: input.companyName, bold: true, size: 30 })],
                }),
                new Paragraph({
                  spacing: { after: 100 },
                  children: [new TextRun({ text: 'Cotización editable en Word', bold: true, size: 24 })],
                }),
                new Paragraph({
                  children: [new TextRun({ text: `Cliente: ${input.clientName}`, size: 22 })],
                }),
                new Paragraph({
                  children: [new TextRun({ text: `Proyecto / cotización: ${input.projectName}`, size: 22 })],
                }),
              ],
            }),
            new TableCell({
              width: { size: 30, type: WidthType.PERCENTAGE },
              borders: this.noBorders(),
              children: [
                this.buildSmallLabel(`Folio: ${input.folio}`),
                this.buildSmallLabel(`Fecha de aceptación: ${this.formatDate(input.acceptedDate)}`),
              ],
            }),
          ],
        }),
      ],
    });
  }

  private buildServiceTables(
    activities: string[],
    ownerName: string,
    companyShortName: string,
  ) {
    if (!activities.length) {
      return [this.buildBodyParagraph('No hay actividades capturadas en esta cotización aceptada.')];
    }

    return activities.flatMap((activity, index) => [
      new Paragraph({
        spacing: { before: 120, after: 80 },
        children: [
          new TextRun({
            text: `${index + 1}. ${activity}`,
            bold: true,
            size: 24,
          }),
        ],
      }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        layout: TableLayoutType.FIXED,
        rows: [
          this.buildPairRow(
            'Actividad realizada',
            activity,
            'Responsable',
            ownerName || companyShortName,
          ),
          this.buildPairRow(
            'Horas / mano de obra',
            'Pendiente de captura en sitio',
            'Materiales asociados',
            'Espacio editable para capturar materiales, marca y cantidad utilizados.',
          ),
          this.buildSingleRow(
            'Observaciones',
            'Espacio editable para documentar resultados, materiales reales, horas definitivas y observaciones de ejecución.',
          ),
        ],
      }),
    ]);
  }

  private buildCostTable(input: {
    materialCost: number;
    laborCost: number;
    totalCost: number;
    factorLines: string[];
  }) {
    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.FIXED,
      rows: [
        this.buildPairRow('Materiales', this.formatMoney(input.materialCost, 'MXN'), 'Mano de obra', this.formatMoney(input.laborCost, 'MXN')),
        this.buildSingleRow('Factores', input.factorLines.join('\n')),
        this.buildPairRow('Margen', 'Pendiente de captura / validación final', 'Total final', this.formatMoney(input.totalCost, 'MXN')),
      ],
    });
  }

  private buildEvidenceSections(activities: string[]) {
    if (!activities.length) {
      return [
        this.buildBodyParagraph(
          'No hay actividades capturadas para documentar evidencias. Este espacio queda editable para registrar avances manualmente.',
        ),
        this.buildEvidenceTable('Actividad no especificada'),
      ];
    }

    return activities.flatMap((activity, index) => [
      new Paragraph({
        spacing: { before: index === 0 ? 0 : 120, after: 80 },
        children: [new TextRun({ text: `${index + 1}. ${activity}`, bold: true, size: 24 })],
      }),
      this.buildEvidenceTable(activity),
    ]);
  }

  private buildEvidenceTable(activity: string) {
    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.FIXED,
      rows: [
        this.buildHeaderRow(['Fecha', 'Actividad', 'Evidencia / foto', 'Comentarios']),
        ...Array.from({ length: 3 }).map(
          () =>
            new TableRow({
              children: [
                this.buildTableCell(' '),
                this.buildTableCell(activity),
                this.buildTableCell('Espacio editable para insertar foto o referencia'),
                this.buildTableCell(' '),
              ],
            }),
        ),
      ],
    });
  }

  private buildSignatureTable(companyName: string, clientName: string) {
    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.FIXED,
      borders: this.noBorders(),
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              borders: this.noBorders(),
              children: [
                this.buildBodyParagraph('_______________________________'),
                this.buildSmallLabel(`Cliente: ${clientName}`),
                this.buildSmallLabel('Nombre y firma'),
              ],
            }),
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              borders: this.noBorders(),
              children: [
                this.buildBodyParagraph('_______________________________'),
                this.buildSmallLabel(`Empresa: ${companyName}`),
                this.buildSmallLabel('Nombre, cargo y firma'),
              ],
            }),
          ],
        }),
      ],
    });
  }

  private buildHeading(text: string) {
    return new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 220, after: 100 },
      border: {
        bottom: { color: 'F97316', space: 1, style: BorderStyle.SINGLE, size: 8 },
      },
      children: [new TextRun({ text, bold: true, size: 28 })],
    });
  }

  private buildBodyParagraph(text: string) {
    return new Paragraph({
      spacing: { after: 90 },
      alignment: AlignmentType.JUSTIFIED,
      children: [new TextRun({ text, size: 22 })],
    });
  }

  private buildSmallLabel(text: string) {
    return new Paragraph({
      spacing: { after: 50 },
      children: [new TextRun({ text, size: 20, color: '4B5563' })],
    });
  }

  private buildHeaderRow(labels: string[]) {
    return new TableRow({
      children: labels.map((label) =>
        new TableCell({
          width: { size: 25, type: WidthType.PERCENTAGE },
          children: [
            new Paragraph({
              children: [new TextRun({ text: label, bold: true, size: 22 })],
            }),
          ],
        }),
      ),
    });
  }

  private buildPairRow(leftLabel: string, leftValue: string, rightLabel: string, rightValue: string) {
    return new TableRow({
      children: [
        this.buildTableCell(`${leftLabel}\n${leftValue}`),
        this.buildTableCell(`${rightLabel}\n${rightValue}`),
      ],
    });
  }

  private buildSingleRow(label: string, value: string) {
    return new TableRow({
      children: [
        new TableCell({
          columnSpan: 2,
          children: [
            new Paragraph({
              spacing: { after: 60 },
              children: [new TextRun({ text: label, bold: true, size: 22 })],
            }),
            ...value.split('\n').map(
              (line) =>
                new Paragraph({
                  spacing: { after: 40 },
                  children: [new TextRun({ text: line || ' ', size: 22 })],
                }),
            ),
          ],
        }),
      ],
    });
  }

  private buildTableCell(value: string) {
    return new TableCell({
      children: value.split('\n').map(
        (line) =>
          new Paragraph({
            spacing: { after: 40 },
            children: [
              new TextRun({
                text: line || ' ',
                size: 22,
              }),
            ],
          }),
      ),
    });
  }

  private buildEditableLines(count: number) {
    return Array.from({ length: count }).map(
      () =>
        new Paragraph({
          spacing: { after: 120 },
          border: {
            bottom: {
              color: 'D1D5DB',
              space: 1,
              style: BorderStyle.SINGLE,
              size: 4,
            },
          },
          children: [new TextRun(' ')],
        }),
    );
  }

  private noBorders() {
    return {
      top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    };
  }

  private formatMoney(value: number, currency: string) {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  }

  private formatDate(value: Date) {
    return new Intl.DateTimeFormat('es-MX', {
      year: 'numeric',
      month: 'long',
      day: '2-digit',
    }).format(value);
  }

  private loadLogoBuffer(logoUrl?: string | null) {
    const logoPath = (logoUrl || '').trim();
    const candidates = [
      logoPath.startsWith('/') ? resolve(process.cwd(), `apps/web/public${logoPath}`) : null,
      logoPath.startsWith('/') ? resolve(process.cwd(), `../web/public${logoPath}`) : null,
      logoPath.startsWith('/') ? resolve(process.cwd(), `public${logoPath}`) : null,
      resolve(process.cwd(), 'apps/web/public/brand/logo.png'),
      resolve(process.cwd(), '../web/public/brand/logo.png'),
      resolve(process.cwd(), 'public/brand/logo.png'),
    ].filter((candidate): candidate is string => Boolean(candidate));

    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        return {
          buffer: readFileSync(candidate),
          type:
            candidate.toLowerCase().endsWith('.jpg') || candidate.toLowerCase().endsWith('.jpeg')
              ? ('jpg' as const)
              : ('png' as const),
        };
      }
    }

    return null;
  }

  private extractActivityLines(
    sections: Array<{ title: string; content: string }>,
    fallbackItems: string[],
  ) {
    const workSection = sections.find(
      (section) => this.normalizeSectionTitle(section.title) === 'trabajos a realizar:',
    );

    const activityLines = workSection?.content?.trim()
      ? this.normalizeWorkItemLines(workSection.content)
      : [];

    if (activityLines.length) {
      return activityLines;
    }

    return fallbackItems.map((item) => item.trim()).filter(Boolean);
  }

  private normalizeWorkItemLines(content: string) {
    return content
      .replace(
        /,\s+(?=(Revision|Revisión|Limpieza|Reapriete|Prueba|Pruebas|Configuracion|Configuración|Entrega|Energizado|Levantamiento|Verificacion|Verificación|Operacion|Operación)\b)/g,
        '\n',
      )
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  private normalizeSectionTitle(title: string) {
    return title
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  private buildQuotationSummaryTable(input: {
    clientName: string;
    contactName: string;
    sellerName: string;
    issueDate: Date;
    validUntil: Date;
    folio: string;
    commercialTitle: string;
  }) {
    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.FIXED,
      rows: [
        this.buildPairRow('Cliente', input.clientName, 'Contacto', input.contactName),
        this.buildPairRow('Folio', input.folio, 'Responsable', input.sellerName),
        this.buildPairRow('Fecha de emisión', this.formatDate(input.issueDate), 'Vigencia', this.formatDate(input.validUntil)),
        this.buildSingleRow('Título comercial', input.commercialTitle),
      ],
    });
  }

  private buildConceptTable(
    items: Array<{
      partNumber: number;
      partQuantity: number;
      serviceCode?: string;
      serviceName: string;
      quantity: number;
      unitPrice: number;
      totalPrice: number;
    }>,
    currency: string,
  ) {
    if (!items.length) {
      return this.buildBodyParagraph('No hay conceptos capturados en esta cotización.');
    }

    let previousPartNumber: number | null = null;
    const rows: TableRow[] = [this.buildConceptHeaderRow()];

    for (const item of items) {
      if (item.partNumber !== previousPartNumber) {
        rows.push(this.buildPartDividerRow(item.partNumber, item.partQuantity));
        previousPartNumber = item.partNumber;
      }

      rows.push(
        new TableRow({
          children: [
            this.buildTableCell(item.serviceCode || '-'),
            this.buildTableCell(item.serviceName),
            this.buildTableCell(this.formatNumber(item.quantity)),
            this.buildTableCell(this.formatMoney(item.unitPrice, currency)),
            this.buildTableCell(this.formatMoney(item.totalPrice, currency)),
          ],
        }),
      );
    }

    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.FIXED,
      rows,
    });
  }

  private buildConceptHeaderRow() {
    return new TableRow({
      children: [
        this.buildBoldCell('Código'),
        this.buildBoldCell('Descripción'),
        this.buildBoldCell('Cantidad'),
        this.buildBoldCell('Precio unitario'),
        this.buildBoldCell('Importe'),
      ],
    });
  }

  private buildPartDividerRow(partNumber: number, partQuantity: number) {
    return new TableRow({
      children: [
        new TableCell({
          columnSpan: 5,
          children: [
            new Paragraph({
              spacing: { after: 60 },
              children: [
                new TextRun({
                  text: `Partida ${partNumber}${partQuantity > 1 ? ` x ${partQuantity}` : ''}`,
                  bold: true,
                  size: 22,
                }),
              ],
            }),
          ],
        }),
      ],
    });
  }

  private buildQuotationTotalsTable(input: {
    conceptsCount: number;
    subtotal: number;
    tax: number;
    total: number;
    finalChargeLabel: string;
    finalChargeRate: number;
    currency: string;
  }) {
    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.FIXED,
      rows: [
        this.buildPairRow('Total conceptos', String(input.conceptsCount), 'Subtotal', this.formatMoney(input.subtotal, input.currency)),
        this.buildPairRow(
          `${input.finalChargeLabel} ${this.formatPercentage(input.finalChargeRate)}`,
          this.formatMoney(input.tax, input.currency),
          'Total',
          this.formatMoney(input.total, input.currency),
        ),
      ],
    });
  }

  private buildCommercialSectionsContent(sections: Array<{ title: string; content: string }>) {
    return sections.flatMap((section) => [
      this.buildHeading(this.cleanSectionTitle(section.title)),
      ...(section.content?.trim()
        ? [this.buildMultilineParagraph(section.content)]
        : [this.buildBodyParagraph('Espacio editable sin contenido capturado.')]),
    ]);
  }

  private buildMultilineParagraph(text: string) {
    return new Paragraph({
      spacing: { after: 90 },
      alignment: AlignmentType.JUSTIFIED,
      children: text.split(/\r?\n/).flatMap((line, index) => [
        new TextRun({ text: line || ' ', size: 22 }),
        ...(index < text.split(/\r?\n/).length - 1 ? [new TextRun({ text: '\n', break: 1 })] : []),
      ]),
    });
  }

  private buildBoldCell(value: string) {
    return new TableCell({
      children: [
        new Paragraph({
          spacing: { after: 40 },
          children: [new TextRun({ text: value, size: 22, bold: true })],
        }),
      ],
    });
  }

  private getVisibleCommercialSections(sections: Array<{ title: string; content: string }>) {
    return sections.filter((section) => {
      const title = section.title?.trim();
      return Boolean(title) && !title.startsWith('__');
    });
  }

  private cleanSectionTitle(title: string) {
    return title.replace(/:\s*$/, '').trim();
  }

  private orderQuotationItems(
    items: Array<{
      partNumber: number;
      partQuantity: number;
      serviceCode?: string;
      serviceName: string;
      quantity: number;
      unitPrice: number;
      totalPrice: number;
    }>,
  ) {
    return [...items].sort((left, right) => {
      if (left.partNumber !== right.partNumber) {
        return left.partNumber - right.partNumber;
      }

      const leftBucket = this.getItemBucket(left.serviceCode);
      const rightBucket = this.getItemBucket(right.serviceCode);
      if (leftBucket !== rightBucket) {
        return leftBucket - rightBucket;
      }

      return this.compareServiceCodes(left.serviceCode, right.serviceCode);
    });
  }

  private getItemBucket(code?: string) {
    const value = (code || '').trim().toUpperCase();
    if (value.startsWith('ACT')) {
      return 0;
    }
    if (value.startsWith('SUM')) {
      return 1;
    }
    return 2;
  }

  private compareServiceCodes(left?: string, right?: string) {
    return (left || '').localeCompare(right || '', 'es-MX', { numeric: true, sensitivity: 'base' });
  }

  private formatNumber(value: number) {
    return new Intl.NumberFormat('es-MX', {
      minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(value);
  }

  private formatPercentage(value: number) {
    return `${new Intl.NumberFormat('es-MX', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(value)}%`;
  }
}
