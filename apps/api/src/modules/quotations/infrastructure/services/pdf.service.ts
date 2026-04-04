import { Injectable } from '@nestjs/common';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import puppeteer from 'puppeteer';

type PdfPayload = {
  folio: string;
  issueDate: string;
  validUntil: string;
  client: {
    legalName: string;
    rfc?: string;
    address?: string;
  };
  quotation: {
    title: string;
    sellerName?: string;
    notes?: string;
    durationOfWork?: string;
    termsAndConditions?: string;
    commercialSections?: Array<{
      title: string;
      content: string;
    }>;
    subtotal: string;
    tax: string;
    total: string;
    currency: string;
  };
  items: Array<{
    serviceCode?: string;
    serviceName: string;
    quantity: string;
    unitPrice: string;
    totalPrice: string;
  }>;
};

const ISSUER = {
  legalName: 'SISTEMAS ELECTRICOS ZARAGOZA',
  rfc: 'SEZ121221V69',
  address: 'Cda. Los Pinos No. 8 A, Francisco I. Madero, Cuautla, Morelos, CP 62744',
  email: 'contacto@sieza.mx',
};

@Injectable()
export class PdfService {
  async renderQuotationPdf(payload: PdfPayload) {
    const logoDataUri = this.loadLogoDataUri();
    return this.renderDocument(this.buildHtml(payload, logoDataUri));
  }

  async renderSimplifiedQuotationPdf(payload: PdfPayload) {
    const logoDataUri = this.loadLogoDataUri();
    return this.renderDocument(this.buildSimpleHtml(payload, logoDataUri));
  }

  private async renderDocument(html: string) {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    await page.setContent(html, {
      waitUntil: 'networkidle0',
    });

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      footerTemplate: this.buildFooterTemplate(),
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

  private buildHtml(payload: PdfPayload, logoDataUri: string | null) {
    const currency = payload.quotation.currency || 'MXN';
    const orderedItems = [...payload.items].sort((left, right) => {
      const leftBucket = this.getItemBucket(left.serviceCode);
      const rightBucket = this.getItemBucket(right.serviceCode);
      if (leftBucket !== rightBucket) {
        return leftBucket - rightBucket;
      }

      return this.compareServiceCodes(left.serviceCode, right.serviceCode);
    });
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
        <td colspan="4" class="summary-label">IVA 16%</td>
        <td class="summary-value">${this.formatMoney(payload.quotation.tax, currency)}</td>
      </tr>
      <tr class="summary-total">
        <td colspan="4">Total</td>
        <td class="summary-value">${this.formatMoney(payload.quotation.total, currency)}</td>
      </tr>
    `;
    const conceptPages = this.paginateConceptItems(orderedItems);
    const conceptTables = conceptPages
      .map((pageItems, pageIndex) => {
        const rows = pageItems
          .map(
            (item, rowIndex) => `
              <tr>
                <td class="index">${this.calculateGlobalIndex(conceptPages, pageIndex, rowIndex)}</td>
                <td class="description">${item.serviceName}</td>
                <td class="qty">${item.quantity}</td>
                <td class="money">${this.formatMoney(item.unitPrice, currency)}</td>
                <td class="money">${this.formatMoney(item.totalPrice, currency)}</td>
              </tr>
            `,
          )
          .join('');

        return `
          <div class="${pageIndex > 0 ? 'page page-break-before continuation-page' : ''}">
          ${pageIndex > 0 ? this.buildContinuationHeader(payload, logoDataUri) : ''}
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

    const workPages = this.buildWorkPages(payload, logoDataUri);
    const notePages = this.buildNotePages(payload, logoDataUri);

    return `
      ${this.wrapDocument(`
          <div class="page">
            ${this.buildPrimaryHeader(payload, logoDataUri)}

            <div class="section">
              <div class="section-header">
                <p class="section-title">Datos Comerciales</p>
              </div>
              <div class="section-body parties">
                <div class="party-card">
                  <p class="party-label">Cliente</p>
                  <p class="party-name">${payload.client.legalName}</p>
                  <div class="party-meta">
                    ${payload.client.rfc ? `RFC: ${payload.client.rfc}<br />` : ''}
                    ${payload.client.address || 'Dirección pendiente de captura'}
                  </div>
                </div>
                <div class="party-card">
                  <p class="party-label">Proveedor</p>
                  <p class="party-name">${ISSUER.legalName}</p>
                  <div class="party-meta">
                    RFC: ${ISSUER.rfc}<br />
                    ${ISSUER.address}
                  </div>
                </div>
              </div>
            </div>

            ${conceptTables}
            ${workPages}
            ${notePages}
          </div>
      `)}
    `;
  }

  private buildSimpleHtml(payload: PdfPayload, logoDataUri: string | null) {
    const currency = payload.quotation.currency || 'MXN';
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
        <td colspan="2" class="summary-label">IVA 16%</td>
        <td class="summary-value">${this.formatMoney(payload.quotation.tax, currency)}</td>
      </tr>
      <tr class="summary-total">
        <td colspan="2">Total</td>
        <td class="summary-value">${this.formatMoney(payload.quotation.total, currency)}</td>
      </tr>
    `;
    const workPages = this.buildWorkPages(payload, logoDataUri);
    const notePages = this.buildNotePages(payload, logoDataUri);

    return `
      ${this.wrapDocument(`
          <div class="page">
            ${this.buildPrimaryHeader(payload, logoDataUri)}

            <div class="section">
              <div class="section-header">
                <p class="section-title">Datos Comerciales</p>
              </div>
              <div class="section-body parties">
                <div class="party-card">
                  <p class="party-label">Cliente</p>
                  <p class="party-name">${payload.client.legalName}</p>
                  <div class="party-meta">
                    ${payload.client.rfc ? `RFC: ${payload.client.rfc}<br />` : ''}
                    ${payload.client.address || 'Dirección pendiente de captura'}
                  </div>
                </div>
                <div class="party-card">
                  <p class="party-label">Proveedor</p>
                  <p class="party-name">${ISSUER.legalName}</p>
                  <div class="party-meta">
                    RFC: ${ISSUER.rfc}<br />
                    ${ISSUER.address}
                  </div>
                </div>
              </div>
            </div>

            <div class="section">
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
                      <td>${payload.quotation.title}</td>
                      <td class="qty">1</td>
                      <td class="money">${this.formatMoney(payload.quotation.subtotal, currency)}</td>
                    </tr>
                    ${simpleSummaryRows}
                  </tbody>
                </table>
              </div>
            </div>
            ${workPages}
            ${notePages}
          </div>
      `)}
    `;
  }

  private buildWorkBlocks(quotation: PdfPayload['quotation']) {
    const workSection = quotation.commercialSections?.find(
      (item) => this.normalizeTitle(item.title) === 'trabajos a realizar:',
    );

    if (!workSection?.content?.trim()) {
      return '';
    }

    const normalizedContent = workSection.content
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .join('\n');

    return `
      <div class="note-card">
        <p>${normalizedContent}</p>
      </div>
    `;
  }

  private buildWorkPages(payload: PdfPayload, logoDataUri: string | null) {
    const workSection = payload.quotation.commercialSections?.find(
      (item) => this.normalizeTitle(item.title) === 'trabajos a realizar:',
    );

    if (!workSection?.content?.trim()) {
      return '';
    }

    const workLines = workSection.content
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    const workPages = this.chunkLinesByUnits(workLines, 18);

    return workPages
      .map(
        (lines) => `
          <div class="page page-break-before continuation-page">
            ${this.buildContinuationHeader(payload, logoDataUri)}
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

  private buildNotePages(payload: PdfPayload, logoDataUri: string | null) {
    const noteSections = this.buildNoteSectionEntries(payload.quotation);
    const notePages = this.chunkNoteSections(noteSections, 18);

    return notePages
      .map(
        (sections) => `
          <div class="page page-break-before continuation-page">
            ${this.buildContinuationHeader(payload, logoDataUri)}
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

  private buildNoteSectionEntries(quotation: PdfPayload['quotation']) {
    if (quotation.commercialSections?.length) {
      return [...quotation.commercialSections]
        .sort(
          (left, right) =>
            this.getCommercialSectionOrder(left.title) - this.getCommercialSectionOrder(right.title),
        )
        .filter((item) => this.normalizeTitle(item.title) !== 'trabajos a realizar:')
        .map((item) => ({ title: item.title, content: item.content }));
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

  private buildNoteBlocks(quotation: PdfPayload['quotation']) {
    if (quotation.commercialSections?.length) {
      const orderedSections = [...quotation.commercialSections].sort(
        (left, right) =>
          this.getCommercialSectionOrder(left.title) - this.getCommercialSectionOrder(right.title),
      );

      return orderedSections
        .filter((item) => this.normalizeTitle(item.title) !== 'trabajos a realizar:')
        .map(
          (item) => `
            <div class="note-card">
              <h4>${item.title}</h4>
              <p>${item.content}</p>
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

  private loadLogoDataUri() {
    const candidates = [
      resolve(process.cwd(), 'apps/web/public/brand/logo.png'),
      resolve(process.cwd(), '../web/public/brand/logo.png'),
      resolve(process.cwd(), 'public/brand/logo.png'),
    ];

    for (const filePath of candidates) {
      if (existsSync(filePath)) {
        const buffer = readFileSync(filePath);
        return `data:image/png;base64,${buffer.toString('base64')}`;
      }
    }

    return null;
  }

  private buildFooterTemplate() {
    return `
      <div style="width:100%; padding:0 16px 10px; font-family: Helvetica Neue, Arial, sans-serif; color:#6b7280;">
        <div style="display:flex; align-items:center; justify-content:space-between; border-top:1px solid #e5e7eb; padding-top:8px; font-size:8px;">
          <div>
            ${ISSUER.legalName} · ${ISSUER.email} · ${ISSUER.address}
          </div>
          <div>
            Página <span class="pageNumber"></span> de <span class="totalPages"></span>
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
      const pageLimit = pages.length === 0 ? 12 : 20;

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

  private buildContinuationHeader(payload: PdfPayload, logoDataUri: string | null) {
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
            <div style="font-size:12px; font-weight:700; letter-spacing:0.12em; color:#111827;">SIEZA</div>
            <div style="font-size:8px; color:#f97316; letter-spacing:0.22em; text-transform:uppercase;">energy solutions</div>
          </div>
        </div>
        <div style="text-align:right;">
          <div class="continuation-folio-label">Cotización</div>
          <div class="continuation-folio-value">${payload.folio}</div>
        </div>
      </div>
    `;
  }

  private buildPrimaryHeader(payload: PdfPayload, logoDataUri: string | null) {
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
            <h1 class="issuer-name">SIEZA</h1>
            <div class="issuer-tagline">energy solutions</div>
            <div class="issuer-meta">
              ${ISSUER.legalName}<br />
              RFC: ${ISSUER.rfc}<br />
              ${ISSUER.address}<br />
              ${ISSUER.email}
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
              padding: 26px 26px 18px;
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
              gap: 18px;
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
              margin-top: 8px;
              color: #6b7280;
              font-size: 11px;
              line-height: 1.55;
            }
            .quote-card {
              border-radius: 18px;
              background: #ffffff;
              color: #111827;
              padding: 18px;
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
              margin: 8px 0 16px;
              font-size: 26px;
              line-height: 1.05;
              font-weight: 700;
              color: #111827;
            }
            .quote-grid {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 12px 16px;
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
              margin-top: 4px;
              font-size: 13px;
              font-weight: 600;
            }
            .section {
              margin-top: 18px;
              border: 1px solid #e5e7eb;
              border-radius: 18px;
              overflow: hidden;
              background: white;
              break-inside: avoid;
              page-break-inside: avoid;
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
              padding: 14px 18px;
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
              padding: 18px;
            }
            .parties {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 16px;
            }
            .party-card {
              border-radius: 16px;
              background: #fcfcfd;
              padding: 16px;
              border: 1px solid #eef2f7;
            }
            .party-label {
              margin: 0 0 8px;
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
              margin-top: 8px;
              font-size: 11px;
              line-height: 1.6;
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
              break-inside: avoid;
              page-break-inside: avoid;
            }
            .concept-table td {
              break-inside: auto;
              page-break-inside: auto;
            }
            th {
              text-align: left;
              font-size: 10px;
              text-transform: uppercase;
              letter-spacing: 0.14em;
              color: #6b7280;
              font-weight: 700;
              background: #fafafa;
              padding: 12px 12px;
              border-bottom: 1px solid #e5e7eb;
            }
            td {
              padding: 12px 12px;
              border-bottom: 1px solid #eef2f7;
              vertical-align: top;
              font-size: 12px;
              color: #1f2937;
              break-inside: avoid;
              page-break-inside: avoid;
            }
            td.index {
              width: 42px;
              color: #9ca3af;
            }
            td.description {
              font-weight: 600;
              line-height: 1.5;
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
              padding: 10px 12px;
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
              display: grid;
              grid-template-columns: 1fr;
              gap: 12px;
            }
            .note-card {
              border-radius: 16px;
              background: #fcfcfd;
              border: 1px solid #eef2f7;
              padding: 16px;
              break-inside: avoid;
              page-break-inside: avoid;
            }
            .note-card h4 {
              margin: 0 0 8px;
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
              line-height: 1.7;
            }
            .continuation-header {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 16px;
              padding: 0 0 10px;
              border-bottom: 1px solid #e5e7eb;
              margin-bottom: 18px;
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

  private formatMoney(value: string, currency: string) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(value));
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
