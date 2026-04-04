import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as XLSX from 'xlsx';
import { CatalogService } from './catalog.service';

type ParsedOptionDefinition = {
  columnIndex: number;
  code: string;
  name: string;
};

type ParsedServiceRow = {
  categoryName: string;
  categoryCode: string;
  unit?: string;
  description?: string;
  relatedWork?: string;
  suffix: string;
  consecutive: string;
  serviceCode: string;
  serviceName: string;
  validFrom?: Date;
  options: Array<{
    code: string;
    name: string;
    mxnPrice: number;
    usdPrice: number;
    sortOrder: number;
  }>;
};

@Injectable()
export class ExcelImportService {
  constructor(private readonly catalogService: CatalogService) {}

  async previewWorkbook(buffer: Buffer, source = 'excel-import') {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const exchangeRateSetting = await this.catalogService.getExchangeRate();
    const exchangeRate = Number(exchangeRateSetting.rate);

    if (!workbook.SheetNames.length) {
      throw new BadRequestException('El archivo Excel no contiene hojas');
    }

    if (!exchangeRate || Number.isNaN(exchangeRate)) {
      throw new BadRequestException('No hay un tipo de cambio valido configurado para calcular USD');
    }

    const rows = this.parseWorkbook(workbook, exchangeRate);

    return {
      source,
      sheets: workbook.SheetNames.length,
      exchangeRate,
      rows,
    };
  }

  async importWorkbook(buffer: Buffer, source = 'excel-import') {
    const preview = await this.previewWorkbook(buffer, source);
    return this.importParsedRows(preview.rows, source, preview.exchangeRate);
  }

  async exportCurrentCatalog() {
    return this.catalogService.exportCatalogWorkbook();
  }

  async importParsedRows(rows: ParsedServiceRow[], source = 'excel-import', exchangeRate?: number) {
    try {
      const logs: Array<Record<string, unknown>> = [];
      const effectiveExchangeRate =
        exchangeRate && !Number.isNaN(exchangeRate)
          ? exchangeRate
          : Number((await this.catalogService.getExchangeRate()).rate);

      for (const parsedRow of rows) {
        await this.catalogService.createCategory({
          code: parsedRow.categoryCode,
          name: parsedRow.categoryName,
          description: undefined,
        });

        const serviceResult = await this.catalogService.createOrVersionService({
          categoryCode: parsedRow.categoryCode,
          serviceCode: parsedRow.serviceCode,
          name: parsedRow.serviceName,
          description: parsedRow.description,
          unit: parsedRow.unit,
          relatedWork: parsedRow.relatedWork,
          source: parsedRow.validFrom
            ? `${source}:${parsedRow.validFrom.toISOString().slice(0, 10)}`
            : source,
        });

        if (parsedRow.options.length) {
          const pricingResult = await this.catalogService.updatePricingProfiles({
            serviceId: serviceResult.service.id,
            profiles: parsedRow.options.map((option) => ({
              code: option.code,
              name: option.name,
              sortOrder: option.sortOrder,
              mxnPrice: option.mxnPrice,
              usdPrice:
                typeof option.usdPrice === 'number'
                  ? option.usdPrice
                  : this.truncateToTwoDecimals(option.mxnPrice / effectiveExchangeRate),
              validFrom: parsedRow.validFrom?.toISOString().slice(0, 10),
              source: parsedRow.validFrom
                ? `${source}:${parsedRow.validFrom.toISOString().slice(0, 10)}`
                : source,
            })),
          });

          const actions = Array.from(
            new Set(
              ((pricingResult as { changes?: Array<{ action: string }> }).changes || []).map(
                (change) => change.action,
              ),
            ),
          );

          logs.push({
            category: parsedRow.categoryName,
            serviceCode: parsedRow.serviceCode,
            serviceName: parsedRow.serviceName,
            options: parsedRow.options.length,
            validFrom: parsedRow.validFrom?.toISOString().slice(0, 10) || null,
            action: actions.length ? actions.join(', ') : 'SERVICE_AND_OPTIONS_IMPORTED',
          });
          continue;
        }

        logs.push({
          category: parsedRow.categoryName,
          serviceCode: parsedRow.serviceCode,
          serviceName: parsedRow.serviceName,
          options: parsedRow.options.length,
          validFrom: parsedRow.validFrom?.toISOString().slice(0, 10) || null,
          action: 'SERVICE_IMPORTED',
        });
      }

      return {
        exchangeRate: effectiveExchangeRate,
        sheets: new Set(rows.map((row) => row.categoryCode)).size,
        processed: logs.length,
        logs,
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2021' || error.code === 'P2022')
      ) {
        throw new BadRequestException(
          'La base local no tiene las tablas o columnas nuevas del historico de precios. Aplica la migracion add_service_pricing_profile_versions y reinicia la API.',
        );
      }

      if (error instanceof BadRequestException) {
        throw error;
      }

      if (error instanceof Error) {
        throw new BadRequestException(`No fue posible confirmar la importacion: ${error.message}`);
      }

      throw error;
    }
  }

  private parseWorkbook(workbook: XLSX.WorkBook, exchangeRate: number) {
    const rows: ParsedServiceRow[] = [];

    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      const sheetRows = XLSX.utils.sheet_to_json<Array<string | number | null>>(worksheet, {
        header: 1,
        blankrows: false,
        defval: '',
        raw: false,
      });

      if (sheetRows.length < 4) {
        throw new BadRequestException(
          `La hoja ${sheetName} debe incluir al menos 4 renglones para encabezados y datos`,
        );
      }

      const optionDefinitions = this.parseOptionDefinitions(sheetRows[1] || [], sheetRows[2] || [], sheetName);
      const dataRows = sheetRows.slice(3);

      for (let index = 0; index < dataRows.length; index += 1) {
        const rowNumber = index + 4;
        const rawRow = dataRows[index];

        if (this.isEmptyRow(rawRow)) {
          continue;
        }

        rows.push(
          this.parseServiceRow(rawRow, optionDefinitions, sheetName, rowNumber, exchangeRate),
        );
      }
    }

    return rows;
  }

  private parseOptionDefinitions(
    keyRow: Array<string | number | null>,
    nameRow: Array<string | number | null>,
    sheetName: string,
  ): ParsedOptionDefinition[] {
    const optionColumns = [6, 7, 8];

    return optionColumns.map((columnIndex, index) => {
      const code = this.normalizeCodeCell(keyRow[columnIndex]);
      const name = this.normalizeTextCell(nameRow[columnIndex]);

      if (!code) {
        throw new BadRequestException(
          `La hoja ${sheetName} requiere la clave de OPCION_${index + 1} en el renglón 2`,
        );
      }

      if (!name) {
        throw new BadRequestException(
          `La hoja ${sheetName} requiere el nombre de OPCION_${index + 1} en el renglón 3`,
        );
      }

      return {
        columnIndex,
        code,
        name,
      };
    });
  }

  private parseServiceRow(
    row: Array<string | number | null>,
    optionDefinitions: ParsedOptionDefinition[],
    sheetName: string,
    rowNumber: number,
    exchangeRate: number,
  ): ParsedServiceRow {
    const categoryName = this.normalizeTextCell(row[0]);
    const unit = this.normalizeTextCell(row[1]) || undefined;
    const description = this.normalizeTextCell(row[2]) || undefined;
    const suffix = this.normalizeCodeCell(row[3]);
    const consecutive = this.normalizeCodeCell(row[4]);
    const serviceName = this.normalizeTextCell(row[5]);
    const validFrom = this.parseDateCell(row[9]);
    const relatedWork = this.normalizeTextCell(row[10]) || undefined;

    if (!categoryName || !suffix || !consecutive || !serviceName) {
      throw new BadRequestException(
        `La hoja ${sheetName} tiene una fila inválida en el renglón ${rowNumber}. Se requieren categoria, sufijo, consecutivo y nombre del servicio.`,
      );
    }

    const options = optionDefinitions.flatMap((option, index) => {
      const cell = this.normalizeTextCell(row[option.columnIndex]);

      if (!cell || cell.toUpperCase() === 'NA') {
        return [];
      }

      const mxnPrice = this.parseNumericCell(cell, sheetName, rowNumber, option.columnIndex);

      return [
        {
          code: option.code,
          name: option.name,
          mxnPrice,
          usdPrice: this.truncateToTwoDecimals(mxnPrice / exchangeRate),
          sortOrder: index + 1,
        },
      ];
    });

    return {
      categoryName,
      categoryCode: this.toCode(categoryName),
      unit,
      description,
      relatedWork,
      suffix,
      consecutive,
      serviceCode: `${suffix}${consecutive}`,
      serviceName,
      validFrom,
      options,
    };
  }

  private parseNumericCell(
    rawValue: string,
    sheetName: string,
    rowNumber: number,
    columnIndex: number,
  ) {
    const normalized = rawValue.replace(/[^0-9.-]/g, '');
    const parsed = Number(normalized);

    if (Number.isNaN(parsed)) {
      throw new BadRequestException(
        `La hoja ${sheetName} tiene un valor no numérico en el renglón ${rowNumber}, columna ${this.columnLabel(columnIndex)}.`,
      );
    }

    return parsed;
  }

  private truncateToTwoDecimals(value: number) {
    return Math.trunc(value * 100) / 100;
  }

  private parseDateCell(value: string | number | null) {
    if (value === null || value === undefined || String(value).trim() === '') {
      return undefined;
    }

    if (typeof value === 'number') {
      const parsed = XLSX.SSF.parse_date_code(value);
      if (!parsed) {
        return undefined;
      }

      return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
    }

    const text = String(value).trim();
    const parsedDate = new Date(text);
    if (Number.isNaN(parsedDate.getTime())) {
      return undefined;
    }

    return parsedDate;
  }

  private isEmptyRow(row: Array<string | number | null>) {
    return row.every((cell) => this.normalizeTextCell(cell) === '');
  }

  private normalizeTextCell(value: string | number | null | undefined) {
    return String(value ?? '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private normalizeCodeCell(value: string | number | null | undefined) {
    return this.normalizeTextCell(value)
      .toUpperCase()
      .replace(/\s+/g, '')
      .replace(/[^A-Z0-9_-]/g, '');
  }

  private toCode(value: string) {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 60);
  }

  private columnLabel(index: number) {
    return String.fromCharCode(65 + index);
  }
}
