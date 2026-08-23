import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, ActivityCatalog } from '@prisma/client';
import * as XLSX from 'xlsx';
import { PrismaService } from '../../../../shared/infrastructure/prisma.service';
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

type ParsedClientRow = {
  nombreEmpresa: string;
  contactoPrincipal: string;
  puestoContacto?: string;
  direccionCompleta?: string;
  ciudad?: string;
  estado?: string;
  pais?: string;
  telefono?: string;
  correoElectronico?: string;
  rfc: string;
  sector?: string;
};

type ParsedActivityRow = {
  name: string;
};

@Injectable()
export class ExcelImportService {
  constructor(
    private readonly catalogService: CatalogService,
    private readonly prisma: PrismaService,
  ) {}

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

  async exportClientTemplate() {
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet([
      {
        nombre_empresa: 'Empresa Ejemplo',
        contacto_principal: 'Juan Perez, Gerente de Mantenimiento',
        direccion_completa: 'Av. Industria 100, Parque Industrial',
        ciudad: 'Monterrey',
        estado: 'Nuevo León',
        pais: 'México',
        telefono: '+52 81 1234 5678',
        correo_electronico: 'mantenimiento@empresa.com',
        RFC: 'EJE960101ABC',
        sector: 'industria',
      },
    ]);

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Clientes');

    return {
      fileName: 'plantilla-clientes.xlsx',
      file: XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' }),
    };
  }

  async exportActivityTemplate() {
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet([
      { actividad: 'Revisión general del equipo de acuerdo con ingeniería' },
      { actividad: 'Limpieza con solvente dieléctrico' },
      { actividad: 'Prueba de resistencia de aislamiento al bus principal' },
    ]);

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Actividades');

    return {
      fileName: 'plantilla-actividades.xlsx',
      file: XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' }),
    };
  }

  async exportClientsData(filters?: { sector?: string; city?: string }) {
    const clients = await this.prisma.client.findMany({
      where: { deletedAt: null },
      include: { contacts: true },
      orderBy: { createdAt: 'asc' },
    });

    const worksheet = XLSX.utils.json_to_sheet(
      clients
        .filter((client) => {
          if (filters?.sector && !client.commercialName?.toLowerCase().includes(filters.sector.toLowerCase())) {
            return false;
          }
          if (filters?.city && client.city && !client.city.toLowerCase().includes(filters.city.toLowerCase())) {
            return false;
          }
          return true;
        })
        .map((client) => {
        const primaryContact = client.contacts.find((contact) => contact.isPrimary) || client.contacts[0];
        return {
          nombre_empresa: client.legalName,
          contacto_principal: primaryContact ? primaryContact.fullName : '',
          puesto_contacto: primaryContact?.position || '',
          direccion_completa: client.address || '',
          ciudad: client.city || '',
          estado: client.state || '',
          pais: client.country || 'México',
          telefono: primaryContact?.phone || '',
          correo_electronico: primaryContact?.email || '',
          rfc: client.rfc,
          sector: client.commercialName || '',
        };
      }),
    );

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Clientes');

    return {
      fileName: 'clientes.xlsx',
      file: XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' }),
    };
  }

  async exportActivitiesData(filters?: { query?: string }) {
    const activities = await this.prisma.activityCatalog.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
    });

    const worksheet = XLSX.utils.json_to_sheet(
      activities
        .filter((activity) =>
          filters?.query
            ? activity.name.toLowerCase().includes(filters.query.toLowerCase())
            : true,
        )
        .map((activity: ActivityCatalog) => ({
        actividad: activity.name,
        creado: activity.createdAt.toISOString().split('T')[0],
        actualizado: activity.updatedAt.toISOString().split('T')[0],
      })),
    );

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Actividades');

    return {
      fileName: 'actividades.xlsx',
      file: XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' }),
    };
  }

  async previewClients(buffer: Buffer, source = 'clients-import', sheetName?: string) {
    const rows = this.parseClientFile(buffer, source, sheetName);
    return {
      source,
      total: rows.length,
      rows,
    };
  }

  async importClients(buffer: Buffer, source = 'clients-import', sheetName?: string) {
    const preview = await this.previewClients(buffer, source, sheetName);
    return this.importParsedClients(preview.rows, source);
  }

  async previewActivities(buffer: Buffer, source = 'activities-import', sheetName?: string) {
    const rows = this.parseActivityFile(buffer, source, sheetName);
    return {
      source,
      total: rows.length,
      rows,
    };
  }

  async importActivities(buffer: Buffer, source = 'activities-import', sheetName?: string) {
    const preview = await this.previewActivities(buffer, source, sheetName);
    return this.importParsedActivities(preview.rows, source);
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

  async importParsedClients(rows: ParsedClientRow[], source = 'clients-import') {
    try {
      const logs: Array<Record<string, unknown>> = [];

      for (const row of rows) {
        const client = await this.prisma.client.upsert({
          where: { rfc: row.rfc },
          update: {
            legalName: row.nombreEmpresa,
            commercialName: row.nombreEmpresa,
            address: row.direccionCompleta || null,
            city: row.ciudad || null,
            state: row.estado || null,
            country: row.pais || 'México',
            updatedAt: new Date(),
            deletedAt: null,
          },
          create: {
            legalName: row.nombreEmpresa,
            commercialName: row.nombreEmpresa,
            rfc: row.rfc,
            address: row.direccionCompleta || null,
            city: row.ciudad || null,
            state: row.estado || null,
            country: row.pais || 'México',
          },
        });

        await this.prisma.contact.deleteMany({
          where: { clientId: client.id },
        });

        await this.prisma.contact.create({
          data: {
            clientId: client.id,
            fullName: row.contactoPrincipal,
            email: row.correoElectronico || null,
            phone: row.telefono || null,
            position: row.puestoContacto || null,
            isPrimary: true,
          },
        });

        logs.push({
          companyName: row.nombreEmpresa,
          rfc: row.rfc,
          contact: row.contactoPrincipal,
          sector: row.sector || null,
          action: 'CLIENT_IMPORTED',
          source,
        });
      }

      return {
        processed: logs.length,
        logs,
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      if (error instanceof Error) {
        throw new BadRequestException(`No fue posible importar clientes: ${error.message}`);
      }

      throw error;
    }
  }

  async importParsedActivities(rows: ParsedActivityRow[], source = 'activities-import') {
    try {
      const logs: Array<Record<string, unknown>> = [];

      for (const row of rows) {
        const existing = await this.prisma.activityCatalog.findUnique({
          where: { name: row.name },
        });

        if (existing) {
          await this.prisma.activityCatalog.update({
            where: { id: existing.id },
            data: {
              name: row.name,
              deletedAt: null,
            },
          });
        } else {
          await this.prisma.activityCatalog.create({
            data: { name: row.name },
          });
        }

        logs.push({
          activityName: row.name,
          action: 'ACTIVITY_IMPORTED',
          source,
        });
      }

      return {
        processed: logs.length,
        logs,
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      if (error instanceof Error) {
        throw new BadRequestException(`No fue posible importar actividades: ${error.message}`);
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

  private parseClientFile(buffer: Buffer, source: string, sheetName?: string) {
    const normalizedSource = source.toLowerCase();

    if (normalizedSource.endsWith('.json')) {
      const content = buffer.toString('utf-8');
      let parsed: unknown;

      try {
        parsed = JSON.parse(content);
      } catch {
        throw new BadRequestException('El archivo JSON de clientes no tiene un formato válido');
      }

      if (!Array.isArray(parsed)) {
        throw new BadRequestException('El archivo JSON de clientes debe contener un arreglo');
      }

      return parsed.map((item, index) => this.parseClientJsonRow(item, index + 1));
    }

    const workbook = XLSX.read(buffer, { type: 'buffer' });
    if (!workbook.SheetNames.length) {
      throw new BadRequestException('El archivo de clientes no contiene hojas');
    }

    const worksheet = this.selectWorksheet(workbook, sheetName);
    const rows = XLSX.utils.sheet_to_json<Record<string, string | number | null>>(worksheet, {
      defval: '',
      raw: false,
    });

    return rows.map((row, index) => this.parseClientSheetRow(row, index + 2));
  }

  private parseActivityFile(buffer: Buffer, source: string, sheetName?: string) {
    const normalizedSource = source.toLowerCase();

    if (normalizedSource.endsWith('.json')) {
      const content = buffer.toString('utf-8');
      let parsed: unknown;

      try {
        parsed = JSON.parse(content);
      } catch {
        throw new BadRequestException('El archivo JSON de actividades no tiene un formato válido');
      }

      if (!Array.isArray(parsed)) {
        throw new BadRequestException('El archivo JSON de actividades debe contener un arreglo');
      }

      return parsed.map((item, index) => this.parseActivityJsonRow(item, index + 1));
    }

    const workbook = XLSX.read(buffer, { type: 'buffer' });
    if (!workbook.SheetNames.length) {
      throw new BadRequestException('El archivo de actividades no contiene hojas');
    }

    const worksheet = this.selectWorksheet(workbook, sheetName);
    const rows = XLSX.utils.sheet_to_json<Record<string, string | number | null>>(worksheet, {
      defval: '',
      raw: false,
    });

    return rows.map((row, index) => this.parseActivitySheetRow(row, index + 2));
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

  async exportCombinedTemplate() {
    const clientWorksheet = XLSX.utils.json_to_sheet([
      {
        nombre_empresa: 'Empresa Ejemplo',
        contacto_principal: 'Juan Perez, Gerente de Mantenimiento',
        direccion_completa: 'Av. Industria 100, Parque Industrial',
        ciudad: 'Monterrey',
        estado: 'Nuevo León',
        pais: 'México',
        telefono: '+52 81 1234 5678',
        correo_electronico: 'mantenimiento@empresa.com',
        RFC: 'EJE960101ABC',
        sector: 'industria',
      },
    ]);

    const activityWorksheet = XLSX.utils.json_to_sheet([
      { actividad: 'Revisión general del equipo de acuerdo con ingeniería' },
      { actividad: 'Limpieza con solvente dieléctrico' },
      { actividad: 'Prueba de resistencia de aislamiento al bus principal' },
    ]);

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, clientWorksheet, 'Clientes');
    XLSX.utils.book_append_sheet(workbook, activityWorksheet, 'Actividades');

    return {
      fileName: 'plantilla-combinada.xlsx',
      file: XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' }),
    };
  }

  private parseClientJsonRow(item: unknown, rowNumber: number): ParsedClientRow {
    if (!item || typeof item !== 'object') {
      throw new BadRequestException(`El JSON de clientes tiene una fila inválida en la posición ${rowNumber}`);
    }

    return this.normalizeClientRow(item as Record<string, unknown>, rowNumber);
  }

  private parseClientSheetRow(
    row: Record<string, string | number | null>,
    rowNumber: number,
  ): ParsedClientRow {
    return this.normalizeClientRow(row, rowNumber);
  }

  private parseActivityJsonRow(item: unknown, rowNumber: number): ParsedActivityRow {
    if (typeof item === 'string') {
      const name = this.normalizeTextCell(item);
      if (!name) {
        throw new BadRequestException(`La fila JSON de actividades ${rowNumber} está vacía.`);
      }
      return { name };
    }

    if (!item || typeof item !== 'object') {
      throw new BadRequestException(`El JSON de actividades tiene una fila inválida en la posición ${rowNumber}`);
    }

    const row = item as Record<string, unknown>;
    const name = this.normalizeTextCell(
      this.toTextValue(row.actividad ?? row.name ?? row.nombre ?? row.descripcion),
    );

    if (!name) {
      throw new BadRequestException(`La fila JSON de actividades ${rowNumber} requiere el campo actividad.`);
    }

    return { name };
  }

  private parseActivitySheetRow(
    row: Record<string, string | number | null>,
    rowNumber: number,
  ): ParsedActivityRow {
    const name = this.normalizeTextCell(
      this.toTextValue(row.actividad ?? row.name ?? row.nombre ?? row.descripcion),
    );

    if (!name) {
      throw new BadRequestException(`La fila Excel de actividades ${rowNumber} requiere la columna actividad.`);
    }

    return { name };
  }

  private selectWorksheet(workbook: XLSX.WorkBook, sheetName?: string) {
    if (!workbook.SheetNames.length) {
      throw new BadRequestException('El archivo no contiene hojas.');
    }

    if (!sheetName) {
      return workbook.Sheets[workbook.SheetNames[0]];
    }

    const normalizedTarget = sheetName.trim().toLowerCase();
    const match = workbook.SheetNames.find((name) => name.trim().toLowerCase() === normalizedTarget);

    if (!match) {
      throw new BadRequestException(`No se encontró la hoja "${sheetName}" en el archivo.`);
    }

    return workbook.Sheets[match];
  }

  private normalizeClientRow(row: Record<string, unknown>, rowNumber: number): ParsedClientRow {
    const nombreEmpresa = this.normalizeTextCell(
      this.toTextValue(row.nombre_empresa ?? row.nombreEmpresa ?? row.empresa ?? row.legalName),
    );
    const contactoPrincipalRaw = this.normalizeTextCell(
      this.toTextValue(row.contacto_principal ?? row.contactoPrincipal ?? row.contacto),
    );
    const rfc = this.normalizeTextCell(this.toTextValue(row.RFC ?? row.rfc)).toUpperCase();

    if (!nombreEmpresa || !contactoPrincipalRaw || !rfc) {
      throw new BadRequestException(
        `La fila de clientes ${rowNumber} requiere nombre_empresa, contacto_principal y RFC.`,
      );
    }

    const [contactoPrincipal, ...positionParts] = contactoPrincipalRaw.split(',');
    const puestoContacto = this.normalizeTextCell(
      this.toTextValue(row.puesto ?? row.puesto_contacto ?? positionParts.join(',')),
    );

    return {
      nombreEmpresa,
      contactoPrincipal: contactoPrincipal.trim(),
      puestoContacto: puestoContacto || undefined,
      direccionCompleta: this.normalizeTextCell(
        this.toTextValue(row.direccion_completa ?? row.direccionCompleta ?? row.address),
      ) || undefined,
      ciudad: this.normalizeTextCell(this.toTextValue(row.ciudad ?? row.city)) || undefined,
      estado: this.normalizeTextCell(this.toTextValue(row.estado ?? row.state)) || undefined,
      pais: this.normalizeTextCell(this.toTextValue(row.pais ?? row.country)) || undefined,
      telefono: this.normalizeTextCell(this.toTextValue(row.telefono ?? row.phone)) || undefined,
      correoElectronico:
        this.normalizeTextCell(
          this.toTextValue(row.correo_electronico ?? row.correoElectronico ?? row.email),
        ) ||
        undefined,
      rfc,
      sector: this.normalizeTextCell(this.toTextValue(row.sector)) || undefined,
    };
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

  private toTextValue(value: unknown): string | number | null | undefined {
    if (typeof value === 'string' || typeof value === 'number' || value === null || value === undefined) {
      return value;
    }

    return String(value);
  }
}
