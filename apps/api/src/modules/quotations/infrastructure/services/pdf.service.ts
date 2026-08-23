import { Injectable } from '@nestjs/common';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import puppeteer from 'puppeteer';
import { CompanyProfileService } from '../../../company-profile/infrastructure/services/company-profile.service';

type PdfPayload = {
  folio: string;
  issueDate: string;
  validUntil: string;
  client: {
    legalName: string;
    contactName?: string;
    rfc?: string;
    address?: string;
  };
  quotation: {
    title: string;
    sellerName?: string;
    notes?: string;
    durationOfWork?: string;
    termsAndConditions?: string;
    executiveSummary?: string;
    commercialSections?: Array<{
      title: string;
      content: string;
    }>;
    subtotal: string;
    finalChargeRate?: string;
    tax: string;
    total: string;
    currency: string;
  };
  items: Array<{
    partNumber?: number;
    partQuantity?: number;
    serviceCode?: string;
    serviceName: string;
    quantity: string;
    unitPrice: string;
    totalPrice: string;
  }>;
};

type ProjectPdfPayload = {
  projectId: string;
  issueDate: string;
  project: {
    name: string;
    client: string;
    sector: string;
    complexity: string;
    description: string;
    total: number;
    currency: string;
  };
  solutions: Array<{
    type: string;
    includes: string[];
    components: Array<{
      type: string;
      name: string;
      brand?: string;
      category: string;
      cost: number;
    }>;
  }>;
};

const DEFAULT_ISSUER = {
  legalName: 'SISTEMAS ELECTRICOS ZARAGOZA',
  brandShortName: 'SIEZA',
  tagline: 'energy solutions',
  logoUrl: '/brand/logo.png',
  rfc: 'SEZ121221V69',
  address: 'Cda. Los Pinos No. 8 A, Francisco I. Madero, Cuautla, Morelos, CP 62744',
  email: 'contacto@sieza.mx',
};

@Injectable()
export class PdfService {
  constructor(private readonly companyProfileService: CompanyProfileService) {}

  async renderQuotationPdf(payload: PdfPayload) {
    const issuer = await this.getIssuerProfile();
    const logoDataUri = this.loadLogoDataUri(issuer.logoUrl);
    return this.renderDocument(this.buildHtml(payload, logoDataUri, issuer), this.buildFooterTemplate(issuer));
  }

  async renderSimplifiedQuotationPdf(payload: PdfPayload) {
    const issuer = await this.getIssuerProfile();
    const logoDataUri = this.loadLogoDataUri(issuer.logoUrl);
    return this.renderDocument(this.buildSimpleHtml(payload, logoDataUri, issuer), this.buildFooterTemplate(issuer));
  }

  async renderProjectPdf(payload: ProjectPdfPayload) {
    const issuer = await this.getIssuerProfile();
    const logoDataUri = this.loadLogoDataUri(issuer.logoUrl);
    return this.renderDocument(this.buildProjectHtml(payload, logoDataUri, issuer), this.buildFooterTemplate(issuer));
  }

  private async renderDocument(html: string, footerTemplate: string) {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(60000);
    await page.setContent(html, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate,
      margin: {
        top: '16px',
        right: '16px',
        bottom: '58px',
        left: '16px',
      },
    });
    await browser.close();
    return pdf;
  }

  private buildHtml(payload: PdfPayload, logoDataUri: string | null, issuer: typeof DEFAULT_ISSUER) {
    const currency = payload.quotation.currency || 'MXN';
    const finalChargeRate = Number(payload.quotation.finalChargeRate || 16);
    const finalChargeLabel = Math.abs(finalChargeRate - 16) < 0.0001 ? 'IVA' : 'Utilidad';
    const orderedItems = [...payload.items].sort((left, right) => {
      const leftPartNumber = Number(left.partNumber || 1);
      const rightPartNumber = Number(right.partNumber || 1);
      if (leftPartNumber !== rightPartNumber) {
        return leftPartNumber - rightPartNumber;
      }

      const leftBucket = this.getItemBucket(left.serviceCode);
      const rightBucket = this.getItemBucket(right.serviceCode);
      if (leftBucket !== rightBucket) {
        return leftBucket - rightBucket;
      }

      return this.compareServiceCodes(left.serviceCode, right.serviceCode);
    });
    const partUnitTotals = orderedItems.reduce<Map<number, number>>((acc, item) => {
      const partNumber = item.partNumber || 1;
      const partQuantity = Math.max(1, item.partQuantity || 1);
      const current = acc.get(partNumber) || 0;
      acc.set(partNumber, current + (Number(item.totalPrice || 0) / partQuantity));
      return acc;
    }, new Map());
    const itemsCount = orderedItems.length;
    const summaryRows = `
      <tr class="summary-row summary-divider">
        <td colspan="4" class="summary-label">Total conceptos</td>
        <td class="summary-value">${itemsCount}</td>
      </tr>
      <tr class="summary-row">
        <td colspan="4" class="summary-label">Subtotal</td>
        <td class="summary-value">${this.formatMoney(payload.quotation.subtotal, currency)}</td>
      </tr>
      <tr class="summary-row">
        <td colspan="4" class="summary-label">${finalChargeLabel} ${this.formatPercentage(finalChargeRate)}</td>
        <td class="summary-value">${this.formatMoney(payload.quotation.tax, currency)}</td>
      </tr>
      <tr class="summary-total">
        <td colspan="4">Total</td>
        <td class="summary-value">${this.formatMoney(payload.quotation.total, currency)}</td>
      </tr>
    `;
    let previousPartNumber: number | null = null;
    const conceptPages = this.paginateConceptItems(orderedItems);
    const conceptBreakClass = this.shouldStartConceptsOnNextPage(payload) ? 'page-break-before' : '';
    const conceptTables = conceptPages
      .map((pageItems, pageIndex) => {
        const rows = pageItems
          .map((item, rowIndex) => {
            const currentPartNumber = item.partNumber || 1;
            const currentPartQuantity = item.partQuantity || 1;
            const partHeader =
              currentPartNumber !== previousPartNumber
                ? `
              <tr class="part-row">
                <td colspan="5">
                  <div class="part-row-content">
                    <span>Partida ${currentPartNumber}${currentPartQuantity > 1 ? ` x ${currentPartQuantity}` : ''}</span>
                    <span>Costo unitario por partida: ${this.formatMoney(String(partUnitTotals.get(currentPartNumber) || 0), currency)}</span>
                  </div>
                </td>
              </tr>
            `
                : '';
            previousPartNumber = currentPartNumber;

            return `
              ${partHeader}
              <tr>
                <td class="index">${this.calculateGlobalIndex(conceptPages, pageIndex, rowIndex)}</td>
                <td class="description">${item.serviceName}</td>
                <td class="qty">${item.quantity}</td>
                <td class="money">${this.formatMoney(item.unitPrice, currency)}</td>
                <td class="money">${this.formatMoney(item.totalPrice, currency)}</td>
              </tr>
            `;
          })
          .join('');

        return `
          <div class="${pageIndex > 0 ? 'page page-break-before continuation-page' : conceptBreakClass}">
          ${pageIndex > 0 ? this.buildContinuationHeader(payload, logoDataUri, issuer) : ''}
          <div class="section concept-section">
            <div class="section-header">
              <p class="section-title">Conceptos de la Cotización</p>
            </div>
            <div class="section-body" style="padding:0;">
              <table class="concept-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Descripción</th>
                    <th>Cantidad</th>
                    <th class="money-header">Precio Unitario</th>
                    <th class="money-header">Importe</th>
                  </tr>
                </thead>
                <tbody>
                  ${rows}
                  ${pageIndex === conceptPages.length - 1 ? summaryRows : ''}
                </tbody>
              </table>
            </div>
          </div>
          </div>
        `;
      })
      .join('');

    const workLayout = this.buildWorkLayout(payload, logoDataUri, issuer);
    const notePages = this.buildNotePages(payload, logoDataUri, issuer);

    return `
      ${this.wrapDocument(`
          <div class="page">
            ${this.buildPrimaryHeader(payload, logoDataUri, issuer)}

            <div class="section">
              <div class="section-header">
                <p class="section-title">Datos Comerciales</p>
              </div>
              <div class="section-body parties">
                <div class="party-card">
                  <p class="party-label">Cliente</p>
                  <p class="party-name">${payload.client.legalName}</p>
                  <div class="party-meta">
                    ${payload.client.contactName ? `Atn: ${payload.client.contactName}<br />` : ''}
                    ${payload.client.rfc ? `RFC: ${payload.client.rfc}<br />` : ''}
                    ${payload.client.address || 'Dirección pendiente de captura'}
                  </div>
                </div>
                <div class="party-card">
                  <p class="party-label">Proveedor</p>
                  <p class="party-name">${issuer.legalName}</p>
                  <div class="party-meta">
                    RFC: ${issuer.rfc}<br />
                    ${issuer.address}
                  </div>
                </div>
              </div>
            </div>

            ${this.buildExecutiveSummarySection(payload)}

            ${conceptTables}
            ${workLayout.inlineSection}
          </div>
          ${workLayout.continuationPages}
          ${notePages}
      `)}
    `;
  }

  private buildSimpleHtml(payload: PdfPayload, logoDataUri: string | null, issuer: typeof DEFAULT_ISSUER) {
    const currency = payload.quotation.currency || 'MXN';
    const finalChargeRate = Number(payload.quotation.finalChargeRate || 16);
    const finalChargeLabel = Math.abs(finalChargeRate - 16) < 0.0001 ? 'IVA' : 'Utilidad';
    const simpleSummaryRows = `
      <tr class="summary-row summary-divider">
        <td colspan="2" class="summary-label">Total conceptos</td>
        <td class="summary-value">1</td>
      </tr>
      <tr class="summary-row">
        <td colspan="2" class="summary-label">Subtotal</td>
        <td class="summary-value">${this.formatMoney(payload.quotation.subtotal, currency)}</td>
      </tr>
      <tr class="summary-row">
        <td colspan="2" class="summary-label">${finalChargeLabel} ${this.formatPercentage(finalChargeRate)}</td>
        <td class="summary-value">${this.formatMoney(payload.quotation.tax, currency)}</td>
      </tr>
      <tr class="summary-total">
        <td colspan="2">Total</td>
        <td class="summary-value">${this.formatMoney(payload.quotation.total, currency)}</td>
      </tr>
    `;
    const workLayout = this.buildWorkLayout(payload, logoDataUri, issuer);
    const notePages = this.buildNotePages(payload, logoDataUri, issuer);
    const conceptBreakClass = this.shouldStartConceptsOnNextPage(payload) ? 'page-break-before' : '';

    return `
      ${this.wrapDocument(`
          <div class="page">
            ${this.buildPrimaryHeader(payload, logoDataUri, issuer)}

            <div class="section">
              <div class="section-header">
                <p class="section-title">Datos Comerciales</p>
              </div>
              <div class="section-body parties">
                <div class="party-card">
                  <p class="party-label">Cliente</p>
                  <p class="party-name">${payload.client.legalName}</p>
                  <div class="party-meta">
                    ${payload.client.contactName ? `Atn: ${payload.client.contactName}<br />` : ''}
                    ${payload.client.rfc ? `RFC: ${payload.client.rfc}<br />` : ''}
                    ${payload.client.address || 'Dirección pendiente de captura'}
                  </div>
                </div>
                <div class="party-card">
                  <p class="party-label">Proveedor</p>
                  <p class="party-name">${issuer.legalName}</p>
                  <div class="party-meta">
                    RFC: ${issuer.rfc}<br />
                    ${issuer.address}
                  </div>
                </div>
              </div>
            </div>

            ${this.buildExecutiveSummarySection(payload)}

            <div class="section ${conceptBreakClass}">
              <div class="section-header">
                <p class="section-title">Concepto del Servicio</p>
              </div>
              <div class="section-body" style="padding:0;">
                <table>
                  <thead>
                    <tr>
                      <th>Descripción</th>
                      <th>Cantidad</th>
                      <th class="money-header">Importe</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>${payload.quotation.title || 'Sin titulo comercial capturado.'}</td>
                      <td class="qty">1</td>
                      <td class="money">${this.formatMoney(payload.quotation.subtotal, currency)}</td>
                    </tr>
                    ${simpleSummaryRows}
                  </tbody>
                </table>
              </div>
            </div>
            ${workLayout.inlineSection}
          </div>
          ${workLayout.continuationPages}
          ${notePages}
      `)}
    `;
  }

  private buildProjectHtml(payload: ProjectPdfPayload, logoDataUri: string | null, issuer: typeof DEFAULT_ISSUER) {
    const solutionBlocks = payload.solutions
      .map(
        (solution) => `
          <div class="section">
            <div class="section-header">
              <p class="section-title">${solution.type}</p>
            </div>
            <div class="section-body">
              <div class="notes">
                <div class="note-card">
                  <h4>Alcance incluido</h4>
                  <p>${solution.includes.length ? solution.includes.join(', ') : 'Sin alcance complementario definido.'}</p>
                </div>
              </div>
              <div style="margin-top:12px;">
                <table>
                  <thead>
                    <tr>
                      <th>Tipo</th>
                      <th>Componente</th>
                      <th>Categoría</th>
                      <th>Marca</th>
                      <th class="money-header">Costo</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${solution.components
                      .map(
                        (component) => `
                          <tr>
                            <td>${component.type}</td>
                            <td class="description">${component.name}</td>
                            <td>${component.category}</td>
                            <td>${component.brand || 'N/A'}</td>
                            <td class="money">${this.formatMoney(String(component.cost), payload.project.currency)}</td>
                          </tr>
                        `,
                      )
                      .join('')}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        `,
      )
      .join('');

    return this.wrapDocument(`
      <div class="page">
        <div class="header">
          <div class="brand">
            <div class="logo-box">
              ${
                logoDataUri
                  ? `<img src="${logoDataUri}" alt="Logo" />`
                  : '<div class="logo-fallback">SZ</div>'
              }
            </div>
            <div>
              <h1 class="issuer-name">${issuer.brandShortName}</h1>
              <div class="issuer-tagline">${issuer.tagline}</div>
              <div class="issuer-meta">
                ${issuer.legalName}<br />
                RFC: ${issuer.rfc}<br />
                ${issuer.address}<br />
                ${issuer.email}
              </div>
            </div>
          </div>
          <div class="quote-card">
            <div class="label">Proyecto IA</div>
            <div class="folio">${payload.projectId.slice(0, 8).toUpperCase()}</div>
            <div class="quote-grid">
              <div class="quote-item">
                <span class="k">Fecha</span>
                <span class="v">${payload.issueDate}</span>
              </div>
              <div class="quote-item">
                <span class="k">Sector</span>
                <span class="v">${payload.project.sector}</span>
              </div>
              <div class="quote-item">
                <span class="k">Complejidad</span>
                <span class="v">${payload.project.complexity || 'Media'}</span>
              </div>
              <div class="quote-item">
                <span class="k">Costo estimado</span>
                <span class="v">${this.formatMoney(String(payload.project.total), payload.project.currency)}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="section">
          <div class="section-header">
            <p class="section-title">Resumen del proyecto</p>
          </div>
          <div class="section-body parties">
            <div class="party-card">
              <p class="party-label">Cliente</p>
              <p class="party-name">${payload.project.client}</p>
              <div class="party-meta">Proyecto: ${payload.project.name}</div>
            </div>
            <div class="party-card">
              <p class="party-label">Descripción</p>
              <div class="party-meta">${payload.project.description}</div>
            </div>
          </div>
        </div>

        ${solutionBlocks}
      </div>
    `);
  }

  private buildWorkBlocks(quotation: PdfPayload['quotation']) {
    const workSection = quotation.commercialSections?.find(
      (item) => this.normalizeTitle(item.title) === 'trabajos a realizar:',
    );

    if (!workSection?.content?.trim()) {
      return '';
    }

    const normalizedContent = workSection.content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .join('\n');

    return `
      <div class="note-card">
        <p>${normalizedContent}</p>
      </div>
    `;
  }

  private buildWorkSection(quotation: PdfPayload['quotation']) {
    const blocks = this.buildWorkBlocks(quotation);
    if (!blocks) {
      return '';
    }

    return `
      <div class="section">
        <div class="section-header">
          <p class="section-title">Trabajos a Realizar</p>
        </div>
        <div class="section-body notes">
          ${blocks}
        </div>
      </div>
    `;
  }

  private buildNotesSection(quotation: PdfPayload['quotation']) {
    const blocks = this.buildNoteBlocks(quotation);
    if (!blocks) {
      return '';
    }

    return `
      <div class="section">
        <div class="section-header">
          <p class="section-title">Condiciones Generales</p>
        </div>
        <div class="section-body notes">
          ${blocks}
        </div>
      </div>
    `;
  }

  private buildWorkPages(payload: PdfPayload, logoDataUri: string | null, issuer: typeof DEFAULT_ISSUER) {
    const workSection = payload.quotation.commercialSections?.find(
      (item) => this.normalizeTitle(item.title) === 'trabajos a realizar:',
    );

    if (!workSection?.content?.trim()) {
      return '';
    }

    const workLines = this.normalizeWorkItemLines(workSection.content);

    const workPages = this.chunkLinesByUnits(workLines, 22);

    return workPages
      .map(
        (lines) => `
          <div class="page page-break-before continuation-page">
            ${this.buildContinuationHeader(payload, logoDataUri, issuer)}
            <div class="section">
              <div class="section-header">
                <p class="section-title">Trabajos a Realizar</p>
              </div>
              <div class="section-body notes">
                <div class="note-card">
                  <p>${lines.join('\n')}</p>
                </div>
              </div>
            </div>
          </div>
        `,
      )
      .join('');
  }

  private buildWorkLayout(payload: PdfPayload, logoDataUri: string | null, issuer: typeof DEFAULT_ISSUER) {
    const workSection = payload.quotation.commercialSections?.find(
      (item) => this.normalizeTitle(item.title) === 'trabajos a realizar:',
    );

    if (!workSection?.content?.trim()) {
      return {
        inlineSection: '',
        continuationPages: '',
      };
    }

    const workLines = this.normalizeWorkItemLines(workSection.content);
    const workPages = this.chunkLinesByUnits(workLines, 22);

    if (!workPages.length) {
      return {
        inlineSection: '',
        continuationPages: '',
      };
    }

    const [firstPageLines, ...remainingPages] = workPages;

    const inlineSection = firstPageLines.length
      ? `
          <div class="section">
            <div class="section-header">
              <p class="section-title">Trabajos a Realizar</p>
            </div>
            <div class="section-body notes">
              <div class="note-card">
                <p>${firstPageLines.join('\n')}</p>
              </div>
            </div>
          </div>
        `
      : '';

    const continuationPages = remainingPages
      .map(
        (lines) => `
          <div class="page page-break-before continuation-page">
            ${this.buildContinuationHeader(payload, logoDataUri, issuer)}
            <div class="section">
              <div class="section-header">
                <p class="section-title">Trabajos a Realizar</p>
              </div>
              <div class="section-body notes">
                <div class="note-card">
                  <p>${lines.join('\n')}</p>
                </div>
              </div>
            </div>
          </div>
        `,
      )
      .join('');

    return {
      inlineSection,
      continuationPages,
    };
  }

  private buildNotePages(payload: PdfPayload, logoDataUri: string | null, issuer: typeof DEFAULT_ISSUER) {
    const noteSections = this.buildNoteSectionEntries(payload.quotation);
    const notePages = this.chunkNoteSections(noteSections, 22);

    return notePages
      .map(
        (sections) => `
          <div class="page page-break-before continuation-page">
            ${this.buildContinuationHeader(payload, logoDataUri, issuer)}
            <div class="section">
              <div class="section-header">
                <p class="section-title">Condiciones Generales</p>
              </div>
              <div class="section-body notes">
                ${sections
                  .map(
                    (item) => `
                      <div class="note-card">
                        <h4>${item.title}</h4>
                        <p>${item.content}</p>
                      </div>
                    `,
                  )
                  .join('')}
              </div>
            </div>
          </div>
        `,
      )
      .join('');
  }

  private buildNoteLayout(payload: PdfPayload, logoDataUri: string | null, issuer: typeof DEFAULT_ISSUER) {
    const noteSections = this.buildNoteSectionEntries(payload.quotation);
    const notePages = this.chunkNoteSections(noteSections, 22);

    if (!notePages.length) {
      return {
        inlineSection: '',
        continuationPages: '',
      };
    }

    const [firstPageSections, ...remainingPages] = notePages;

    const inlineSection = firstPageSections.length
      ? `
          <div class="section">
            <div class="section-header">
              <p class="section-title">Condiciones Generales</p>
            </div>
            <div class="section-body notes">
              ${firstPageSections
                .map(
                  (item) => `
                    <div class="note-card">
                      <h4>${item.title}</h4>
                      <p>${item.content}</p>
                    </div>
                  `,
                )
                .join('')}
            </div>
          </div>
        `
      : '';

    const continuationPages = remainingPages
      .map(
        (sections) => `
          <div class="page page-break-before continuation-page">
            ${this.buildContinuationHeader(payload, logoDataUri, issuer)}
            <div class="section">
              <div class="section-header">
                <p class="section-title">Condiciones Generales</p>
              </div>
              <div class="section-body notes">
                ${sections
                  .map(
                    (item) => `
                      <div class="note-card">
                        <h4>${item.title}</h4>
                        <p>${item.content}</p>
                      </div>
                    `,
                  )
                  .join('')}
              </div>
            </div>
          </div>
        `,
      )
      .join('');

    return {
      inlineSection,
      continuationPages,
    };
  }

  private buildNoteSectionEntries(quotation: PdfPayload['quotation']) {
    if (quotation.commercialSections?.length) {
      return [...quotation.commercialSections]
        .sort(
          (left, right) =>
            this.getCommercialSectionOrder(left.title) - this.getCommercialSectionOrder(right.title),
        )
        .filter(
          (item) =>
            this.normalizeTitle(item.title) !== 'trabajos a realizar:' &&
            !item.title.startsWith('__') &&
            this.hasRenderableSectionContent(item.content),
        )
        .map((item) => ({
          title: item.title,
          content: this.normalizeRenderableSectionContent(item.content),
        }));
    }

    return [
      {
        title: 'Duración de los trabajos',
        content:
          quotation.durationOfWork ||
          'El tiempo de ejecución dependerá de las facilidades en sitio, ventanas de maniobra y disponibilidad operativa del cliente.',
      },
      {
        title: 'Términos y condiciones',
        content:
          quotation.termsAndConditions ||
          'Se requiere orden de compra formal y las condiciones pactadas con el cliente para iniciar trabajos.',
      },
      {
        title: 'Entregables',
        content: 'Se consideran reportes de campo y evidencia de servicio conforme al alcance contratado.',
      },
    ];
  }

  private chunkNoteSections(
    sections: Array<{ title: string; content: string }>,
    limit: number,
  ) {
    const pages: Array<Array<{ title: string; content: string }>> = [];
    let currentPage: Array<{ title: string; content: string }> = [];
    let currentUnits = 0;

    for (const section of sections) {
      const units = this.estimateTextUnits(`${section.title}\n${section.content}`, 220);
      if (currentPage.length && currentUnits + units > limit) {
        pages.push(currentPage);
        currentPage = [];
        currentUnits = 0;
      }

      currentPage.push(section);
      currentUnits += units;
    }

    if (currentPage.length) {
      pages.push(currentPage);
    }

    return pages;
  }

  private chunkLinesByUnits(lines: string[], limit: number) {
    const pages: string[][] = [];
    let currentPage: string[] = [];
    let currentUnits = 0;

    for (const line of lines) {
      const units = this.estimateTextUnits(line, 140);
      if (currentPage.length && currentUnits + units > limit) {
        pages.push(currentPage);
        currentPage = [];
        currentUnits = 0;
      }

      currentPage.push(line);
      currentUnits += units;
    }

    if (currentPage.length) {
      pages.push(currentPage);
    }

    return pages;
  }

  private estimateTextUnits(text: string, charsPerUnit: number) {
    return Math.max(1, Math.ceil(text.trim().length / charsPerUnit));
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

  private buildNoteBlocks(quotation: PdfPayload['quotation']) {
    if (quotation.commercialSections?.length) {
      const orderedSections = [...quotation.commercialSections].sort(
        (left, right) =>
          this.getCommercialSectionOrder(left.title) - this.getCommercialSectionOrder(right.title),
      );

      return orderedSections
        .filter(
          (item) =>
            this.normalizeTitle(item.title) !== 'trabajos a realizar:' &&
            !item.title.startsWith('__') &&
            this.hasRenderableSectionContent(item.content),
        )
        .map(
          (item) => `
            <div class="note-card">
              <h4>${item.title}</h4>
              <p>${this.normalizeRenderableSectionContent(item.content)}</p>
            </div>
          `,
        )
        .join('');
    }

    const defaults = [
      {
        title: 'Duración de los trabajos',
        text:
          quotation.durationOfWork ||
          'El tiempo de ejecución dependerá de las facilidades en sitio, ventanas de maniobra y disponibilidad operativa del cliente.',
      },
      {
        title: 'Términos y condiciones',
        text:
          quotation.termsAndConditions ||
          'Se requiere orden de compra formal y las condiciones pactadas con el cliente para iniciar trabajos.',
      },
      {
        title: 'Entregables',
        text: 'Se consideran reportes de campo y evidencia de servicio conforme al alcance contratado.',
      },
    ];

    return defaults
      .map(
        (item) => `
          <div class="note-card">
            <h4>${item.title}</h4>
            <p>${item.text}</p>
          </div>
        `,
      )
      .join('');
  }

  private loadLogoDataUri(logoUrl?: string | null) {
    const logoPath = (logoUrl || '').trim();
    const candidates = [
      logoPath.startsWith('/')
        ? resolve(process.cwd(), `apps/web/public${logoPath}`)
        : null,
      logoPath.startsWith('/')
        ? resolve(process.cwd(), `../web/public${logoPath}`)
        : null,
      logoPath.startsWith('/')
        ? resolve(process.cwd(), `public${logoPath}`)
        : null,
      resolve(process.cwd(), 'apps/web/public/brand/logo.png'),
      resolve(process.cwd(), '../web/public/brand/logo.png'),
      resolve(process.cwd(), 'public/brand/logo.png'),
    ].filter((candidate): candidate is string => Boolean(candidate));

    for (const filePath of candidates) {
      if (existsSync(filePath)) {
        const buffer = readFileSync(filePath);
        return `data:image/png;base64,${buffer.toString('base64')}`;
      }
    }

    return null;
  }

  private buildFooterTemplate(issuer: typeof DEFAULT_ISSUER) {
    return `
      <div style="width:100%; padding:0 16px 10px; font-family: Helvetica Neue, Arial, sans-serif; color:#6b7280;">
        <div style="display:flex; align-items:center; justify-content:space-between; border-top:1px solid #e5e7eb; padding-top:8px; font-size:8px;">
          <div>
            ${issuer.legalName} · ${issuer.email} · ${issuer.address}
          </div>
          <div>
            Página <span class="pageNumber"></span> de <span class="totalPages"></span>
          </div>
        </div>
      </div>
    `;
  }

  private buildHeaderTemplate(issuer: typeof DEFAULT_ISSUER, reference: string, logoDataUri: string | null) {
    return `
      <div style="width:100%; padding:8px 16px 0; font-family: Helvetica Neue, Arial, sans-serif; color:#6b7280;">
        <div style="display:flex; align-items:center; justify-content:space-between; border-bottom:1px solid #e5e7eb; padding-bottom:6px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <div style="width:24px; height:24px; border-radius:6px; border:1px solid #fdba74; background:#fff7ed; display:flex; align-items:center; justify-content:center; overflow:hidden;">
              ${
                logoDataUri
                  ? `<img src="${logoDataUri}" alt="Logo" style="max-width:18px; max-height:18px; object-fit:contain;" />`
                  : `<span style="font-size:10px; font-weight:700; color:#f97316;">${issuer.brandShortName.slice(0, 2)}</span>`
              }
            </div>
            <div>
              <div style="font-size:9px; font-weight:700; letter-spacing:0.12em; text-transform:uppercase; color:#111827; line-height:1.1;">
                ${issuer.brandShortName}
              </div>
              <div style="font-size:7px; letter-spacing:0.18em; text-transform:uppercase; color:#f97316; line-height:1.1;">
                ${issuer.tagline}
              </div>
            </div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:7px; letter-spacing:0.12em; text-transform:uppercase; color:#6b7280;">Referencia</div>
            <div style="font-size:9px; font-weight:700; color:#374151;">${reference}</div>
          </div>
        </div>
      </div>
    `;
  }

  private paginateConceptItems(items: PdfPayload['items']) {
    const pages: PdfPayload['items'][] = [];
    let currentPage: PdfPayload['items'] = [];
    let currentUnits = 0;

    for (const item of items) {
      const units = this.estimateConceptUnits(item.serviceName);
      const pageLimit = pages.length === 0 ? 14 : 22;

      if (currentPage.length && currentUnits + units > pageLimit) {
        pages.push(currentPage);
        currentPage = [];
        currentUnits = 0;
      }

      currentPage.push(item);
      currentUnits += units;
    }

    if (currentPage.length) {
      pages.push(currentPage);
    }

    return pages.length ? pages : [[]];
  }

  private estimateConceptUnits(serviceName: string) {
    const normalizedLength = serviceName.trim().length;
    return Math.max(1, Math.ceil(normalizedLength / 70));
  }

  private calculateGlobalIndex(
    pages: PdfPayload['items'][],
    pageIndex: number,
    rowIndex: number,
  ) {
    const previousCount = pages
      .slice(0, pageIndex)
      .reduce((sum, page) => sum + page.length, 0);

    return previousCount + rowIndex + 1;
  }

  private buildContinuationHeader(payload: PdfPayload, logoDataUri: string | null, issuer: typeof DEFAULT_ISSUER) {
    return `
      <div class="continuation-header">
        <div class="continuation-brand">
          <div class="continuation-logo">
            ${
              logoDataUri
                ? `<img src="${logoDataUri}" alt="Logo" />`
                : `<span style="font-size:12px; font-weight:700; color:#f97316;">SZ</span>`
            }
          </div>
          <div>
            <div style="font-size:12px; font-weight:700; letter-spacing:0.12em; color:#111827;">${issuer.brandShortName}</div>
            <div style="font-size:8px; color:#f97316; letter-spacing:0.22em; text-transform:uppercase;">${issuer.tagline}</div>
          </div>
        </div>
        <div style="text-align:right;">
          <div class="continuation-folio-label">Cotización</div>
          <div class="continuation-folio-value">${payload.folio}</div>
        </div>
      </div>
    `;
  }

  private buildPrimaryHeader(payload: PdfPayload, logoDataUri: string | null, issuer: typeof DEFAULT_ISSUER) {
    const currency = payload.quotation.currency || 'MXN';

    return `
      <div class="header">
        <div class="brand">
          <div class="logo-box">
            ${
              logoDataUri
                ? `<img src="${logoDataUri}" alt="Logo" />`
                : '<div class="logo-fallback">SZ</div>'
            }
          </div>
          <div>
            <h1 class="issuer-name">${issuer.brandShortName}</h1>
            <div class="issuer-tagline">${issuer.tagline}</div>
            <div class="issuer-meta">
              ${issuer.legalName}<br />
              RFC: ${issuer.rfc}<br />
              ${issuer.address}<br />
              ${issuer.email}
            </div>
          </div>
        </div>
        <div class="quote-card">
          <div class="label">Cotización</div>
          <div class="folio">${payload.folio}</div>
          <div class="quote-grid">
            <div class="quote-item">
              <span class="k">Fecha de cotización</span>
              <span class="v">${payload.issueDate}</span>
            </div>
            <div class="quote-item">
              <span class="k">Vencimiento</span>
              <span class="v">${payload.validUntil}</span>
            </div>
            <div class="quote-item">
              <span class="k">Vendedor</span>
              <span class="v">${payload.quotation.sellerName || 'Sin asignar'}</span>
            </div>
            <div class="quote-item">
              <span class="k">Moneda</span>
              <span class="v">${currency}</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private buildExecutiveSummarySection(payload: PdfPayload) {
    const summary = payload.quotation.executiveSummary?.trim();
    if (!summary) {
      return '';
    }

    const formatted = summary.replace(/\n/g, '<br />');
    return `
      <div class="section">
        <div class="section-header">
          <p class="section-title">Resumen ejecutivo</p>
        </div>
        <div class="section-body notes">
          <div class="note-card">
            <p>${formatted}</p>
          </div>
        </div>
      </div>
    `;
  }

  private shouldStartConceptsOnNextPage(payload: PdfPayload) {
    const summary = payload.quotation.executiveSummary?.trim();
    if (!summary) {
      return false;
    }

    const normalized = summary.replace(/\s+/g, ' ').trim();
    const explicitLineBreaks = summary.split(/\r?\n/).length - 1;
    const estimatedLines = Math.ceil(normalized.length / 92) + explicitLineBreaks;
    const usablePageLines = 32;

    return estimatedLines / usablePageLines > 0.7;
  }

  private wrapDocument(body: string) {
    return `
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            * { box-sizing: border-box; }
            body {
              margin: 0;
              font-family: "Helvetica Neue", Arial, Helvetica, sans-serif;
              color: #1f2937;
              background: #ffffff;
            }
            .page {
              padding: 22px 24px 16px;
              background: #ffffff;
              min-height: 100vh;
              border-top: 6px solid #f97316;
            }
            .continuation-page {
              padding-top: 10px;
              border-top: 0;
              min-height: auto;
            }
            .header {
              display: grid;
              grid-template-columns: 1.2fr 0.8fr;
              gap: 14px;
              align-items: start;
            }
            .brand {
              display: flex;
              gap: 16px;
              align-items: flex-start;
            }
            .logo-box {
              width: 82px;
              height: 82px;
              border-radius: 16px;
              background: #fffaf5;
              display: flex;
              align-items: center;
              justify-content: center;
              overflow: hidden;
              border: 1px solid #fdba74;
            }
            .logo-box img {
              max-width: 70px;
              max-height: 70px;
              object-fit: contain;
            }
            .logo-fallback {
              color: #f97316;
              font-weight: 700;
              font-size: 24px;
            }
            .issuer-name {
              margin: 0;
              font-size: 24px;
              line-height: 1.1;
              font-weight: 700;
              color: #111827;
              text-transform: uppercase;
              letter-spacing: 0.08em;
            }
            .issuer-tagline {
              margin-top: 4px;
              color: #f97316;
              font-size: 10px;
              font-weight: 600;
              text-transform: uppercase;
              letter-spacing: 0.28em;
            }
            .issuer-meta {
              margin-top: 6px;
              color: #6b7280;
              font-size: 11px;
              line-height: 1.35;
            }
            .quote-card {
              border-radius: 18px;
              background: #ffffff;
              color: #111827;
              padding: 14px;
              border: 1px solid #d1d5db;
            }
            .quote-card .label {
              color: #6b7280;
              font-size: 10px;
              text-transform: uppercase;
              letter-spacing: 0.18em;
              font-weight: 700;
            }
            .quote-card .folio {
              margin: 6px 0 12px;
              font-size: 26px;
              line-height: 1.05;
              font-weight: 700;
              color: #111827;
            }
            .quote-grid {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 8px 12px;
            }
            .quote-item span, .quote-item div {
              display: block;
            }
            .quote-item .k {
              color: #6b7280;
              font-size: 10px;
              text-transform: uppercase;
              letter-spacing: 0.15em;
            }
            .quote-item .v {
              margin-top: 3px;
              font-size: 13px;
              font-weight: 600;
            }
            .section {
              margin-top: 12px;
              border: 1px solid #e5e7eb;
              border-radius: 18px;
              overflow: hidden;
              background: white;
              break-inside: auto;
              page-break-inside: auto;
            }
            .concept-section {
              break-inside: auto;
              page-break-inside: auto;
            }
            .page-break-before {
              break-before: page;
              page-break-before: always;
            }
            .section-header {
              padding: 10px 14px;
              border-bottom: 1px solid #e5e7eb;
              background: #fafafa;
            }
            .section-title {
              margin: 0;
              font-size: 11px;
              text-transform: uppercase;
              letter-spacing: 0.18em;
              color: #6b7280;
              font-weight: 700;
            }
            .section-body {
              padding: 12px;
            }
            .parties {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 12px;
            }
            .party-card {
              border-radius: 16px;
              background: #fcfcfd;
              padding: 12px;
              border: 1px solid #eef2f7;
            }
            .party-label {
              margin: 0 0 5px;
              color: #f97316;
              font-size: 10px;
              text-transform: uppercase;
              letter-spacing: 0.16em;
              font-weight: 700;
            }
            .party-name {
              margin: 0;
              font-size: 16px;
              font-weight: 700;
              color: #111827;
            }
            .party-meta {
              margin-top: 5px;
              font-size: 11px;
              line-height: 1.35;
              color: #4b5563;
            }
            table {
              width: 100%;
              border-collapse: collapse;
            }
            .concept-table thead {
              display: table-header-group;
            }
            .concept-table tbody {
              display: table-row-group;
            }
            .concept-table tr {
              break-inside: auto;
              page-break-inside: auto;
            }
            .concept-table td {
              break-inside: auto;
              page-break-inside: auto;
            }
            .part-row td {
              background: #eef2ff;
              color: #1e3a8a;
              font-size: 10px;
              font-weight: 700;
              letter-spacing: 0.14em;
              text-transform: uppercase;
            }
            .part-row-content {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 16px;
            }
            th {
              text-align: left;
              font-size: 10px;
              text-transform: uppercase;
              letter-spacing: 0.14em;
              color: #6b7280;
              font-weight: 700;
              background: #fafafa;
              padding: 8px 10px;
              border-bottom: 1px solid #e5e7eb;
            }
            td {
              padding: 8px 10px;
              border-bottom: 1px solid #eef2f7;
              vertical-align: top;
              font-size: 12px;
              color: #1f2937;
              break-inside: auto;
              page-break-inside: auto;
            }
            td.index {
              width: 42px;
              color: #9ca3af;
            }
            td.description {
              font-weight: 600;
              line-height: 1.25;
            }
            td.qty {
              width: 80px;
              text-align: center;
            }
            td.money {
              width: 180px;
              text-align: right;
              white-space: nowrap;
            }
            th.money-header {
              text-align: right;
            }
            .summary-row td {
              padding: 7px 10px;
              border-top: 1px solid #d1d5db;
              border-bottom: 0;
              background: #fafafa;
              font-size: 12px;
            }
            .summary-divider td {
              border-top: 2px solid #d1d5db;
            }
            .summary-label {
              font-weight: 700;
              color: #374151;
            }
            .summary-value {
              text-align: right;
              white-space: nowrap;
              font-weight: 600;
            }
            .summary-total td {
              background: #111827;
              color: white;
              font-weight: 700;
            }
            .notes {
              display: block;
            }
            .note-card {
              border-radius: 16px;
              background: #fcfcfd;
              border: 1px solid #eef2f7;
              padding: 11px;
              break-inside: auto;
              page-break-inside: auto;
            }
            .note-card + .note-card {
              margin-top: 8px;
            }
            .note-card h4 {
              margin: 0 0 5px;
              font-size: 11px;
              color: #111827;
              text-transform: uppercase;
              letter-spacing: 0.12em;
            }
            .note-card p {
              margin: 0;
              white-space: pre-wrap;
              color: #4b5563;
              font-size: 11px;
              line-height: 1.28;
            }
            .continuation-header {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 16px;
              padding: 0 0 8px;
              border-bottom: 1px solid #e5e7eb;
              margin-bottom: 12px;
            }
            .continuation-brand {
              display: flex;
              align-items: center;
              gap: 10px;
            }
            .continuation-logo {
              width: 34px;
              height: 34px;
              border-radius: 10px;
              background: #fff7ed;
              border: 1px solid #fdba74;
              display: flex;
              align-items: center;
              justify-content: center;
              overflow: hidden;
            }
            .continuation-logo img {
              max-width: 26px;
              max-height: 26px;
              object-fit: contain;
            }
            .continuation-folio-label {
              font-size: 8px;
              color: #6b7280;
              text-transform: uppercase;
              letter-spacing: 0.14em;
            }
            .continuation-folio-value {
              font-size: 11px;
              font-weight: 700;
              color: #111827;
            }
          </style>
        </head>
        <body>${body}</body>
      </html>
    `;
  }

  private async getIssuerProfile() {
    const profile = await this.companyProfileService.getProfile().catch(() => null);
    return {
      legalName: profile?.legalName || DEFAULT_ISSUER.legalName,
      brandShortName: profile?.brandShortName || profile?.commercialName || DEFAULT_ISSUER.brandShortName,
      tagline: profile?.tagline || DEFAULT_ISSUER.tagline,
      logoUrl: profile?.logoUrl || DEFAULT_ISSUER.logoUrl,
      rfc: profile?.rfc || DEFAULT_ISSUER.rfc,
      address: profile?.address || DEFAULT_ISSUER.address,
      email: profile?.email || DEFAULT_ISSUER.email,
    };
  }

  private formatMoney(value: string, currency: string) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(value));
  }

  private formatPercentage(value: number) {
    return `${Number(value.toFixed(2)).toString().replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1')}%`;
  }

  private compareServiceCodes(left?: string, right?: string) {
    return (left || '').localeCompare(right || '', 'es', {
      numeric: true,
      sensitivity: 'base',
    });
  }

  private getCommercialSectionOrder(title: string) {
    const normalized = this.normalizeTitle(title);

    const orderMap = new Map<string, number>([
      ['duracion de los trabajos:', 0],
      ['notas importantes:', 1],
      ['precios y validez:', 2],
      ['condiciones de pago:', 3],
    ]);

    return orderMap.get(normalized) ?? 99;
  }

  private normalizeTitle(title: string) {
    return title
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  private hasRenderableSectionContent(content?: string | null) {
    return Boolean(String(content || '').trim());
  }

  private normalizeRenderableSectionContent(content?: string | null) {
    const normalizedLines = String(content || '')
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map((line) => line.trim());

    const collapsedLines: string[] = [];

    for (const line of normalizedLines) {
      const previous = collapsedLines[collapsedLines.length - 1];

      if (!line) {
        if (!previous) {
          continue;
        }

        collapsedLines.push('');
        continue;
      }

      collapsedLines.push(line);
    }

    while (collapsedLines[collapsedLines.length - 1] === '') {
      collapsedLines.pop();
    }

    return collapsedLines.join('\n').trim();
  }

  private getItemBucket(serviceCode?: string) {
    if (serviceCode === 'ADICIONAL') {
      return 1;
    }

    if (serviceCode === 'VIATICOS') {
      return 2;
    }

    return 0;
  }
}
