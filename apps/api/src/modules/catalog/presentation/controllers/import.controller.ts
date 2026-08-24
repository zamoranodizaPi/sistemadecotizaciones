import { Body, Controller, Get, Post, Query, UseGuards, ValidationPipe } from '@nestjs/common';
import {
  IsArray,
  IsBase64,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Roles } from '../../../auth/presentation/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../auth/presentation/guards/jwt-auth.guard';
import { RolesGuard } from '../../../auth/presentation/guards/roles.guard';
import { ExcelImportService } from '../../infrastructure/services/excel-import.service';

class ImportExcelDto {
  @IsBase64()
  file!: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsString()
  sheetName?: string;
}

class ImportOptionDto {
  @IsString()
  code!: string;

  @IsString()
  name!: string;

  @IsNumber()
  mxnPrice!: number;

  @IsNumber()
  usdPrice!: number;

  @IsNumber()
  sortOrder!: number;
}

class ImportPreviewRowDto {
  @IsString()
  categoryName!: string;

  @IsString()
  categoryCode!: string;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  relatedWork?: string;

  @IsString()
  suffix!: string;

  @IsString()
  consecutive!: string;

  @IsString()
  serviceCode!: string;

  @IsString()
  serviceName!: string;

  @IsOptional()
  validFrom?: string | Date;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportOptionDto)
  options!: ImportOptionDto[];
}

class ConfirmImportDto {
  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsNumber()
  exchangeRate?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportPreviewRowDto)
  rows!: ImportPreviewRowDto[];
}

class ClientImportPreviewRowDto {
  @IsString()
  nombreEmpresa!: string;

  @IsString()
  contactoPrincipal!: string;

  @IsOptional()
  @IsString()
  puestoContacto?: string;

  @IsOptional()
  @IsString()
  direccionCompleta?: string;

  @IsOptional()
  @IsString()
  ciudad?: string;

  @IsOptional()
  @IsString()
  estado?: string;

  @IsOptional()
  @IsString()
  pais?: string;

  @IsOptional()
  @IsString()
  telefono?: string;

  @IsOptional()
  @IsString()
  correoElectronico?: string;

  @IsString()
  rfc!: string;

  @IsOptional()
  @IsString()
  sector?: string;
}

class ConfirmClientImportDto {
  @IsOptional()
  @IsString()
  source?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ClientImportPreviewRowDto)
  rows!: ClientImportPreviewRowDto[];
}

class ActivityImportPreviewRowDto {
  @IsString()
  name!: string;
}

class ConfirmActivityImportDto {
  @IsOptional()
  @IsString()
  source?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ActivityImportPreviewRowDto)
  rows!: ActivityImportPreviewRowDto[];
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('imports')
export class ImportController {
  constructor(private readonly importService: ExcelImportService) {}

  @Post('excel/preview')
  @Roles('ADMIN', 'SALES')
  async previewExcel(@Body() body: ImportExcelDto) {
    const buffer = Buffer.from(body.file, 'base64');
    return this.importService.previewWorkbook(buffer, body.source);
  }

  @Post('excel')
  @Roles('ADMIN', 'SALES')
  async importExcel(@Body() body: ImportExcelDto) {
    const buffer = Buffer.from(body.file, 'base64');
    return this.importService.importWorkbook(buffer, body.source);
  }

  @Post('excel/confirm')
  @Roles('ADMIN', 'SALES')
  async confirmExcelImport(
    @Body(new ValidationPipe({ transform: true })) body: ConfirmImportDto,
  ) {
    return this.importService.importParsedRows(
      body.rows.map((row) => ({
        ...row,
        validFrom: row.validFrom ? new Date(row.validFrom) : undefined,
      })),
      body.source,
      body.exchangeRate,
    );
  }

  @Post('clients/preview')
  @Roles('ADMIN', 'SALES')
  async previewClients(@Body() body: ImportExcelDto) {
    const buffer = Buffer.from(body.file, 'base64');
    return this.importService.previewClients(buffer, body.source, body.sheetName);
  }

  @Post('clients/confirm')
  @Roles('ADMIN', 'SALES')
  async confirmClientsImport(
    @Body(new ValidationPipe({ transform: true })) body: ConfirmClientImportDto,
  ) {
    return this.importService.importParsedClients(body.rows, body.source);
  }

  @Post('activities/preview')
  @Roles('ADMIN', 'SALES')
  async previewActivities(@Body() body: ImportExcelDto) {
    const buffer = Buffer.from(body.file, 'base64');
    return this.importService.previewActivities(buffer, body.source, body.sheetName);
  }

  @Post('activities/confirm')
  @Roles('ADMIN', 'SALES')
  async confirmActivitiesImport(
    @Body(new ValidationPipe({ transform: true })) body: ConfirmActivityImportDto,
  ) {
    return this.importService.importParsedActivities(body.rows, body.source);
  }

  @Get('excel/export')
  @Roles('ADMIN', 'SALES')
  exportExcelTemplate() {
    return this.importService.exportCurrentCatalog();
  }

  @Get('clients/export')
  @Roles('ADMIN', 'SALES')
  exportClientTemplate() {
    return this.importService.exportClientTemplate();
  }

  @Get('activities/export')
  @Roles('ADMIN', 'SALES')
  exportActivityTemplate() {
    return this.importService.exportActivityTemplate();
  }

  @Get('clients/export/data')
  @Roles('ADMIN', 'SALES')
  exportClientsData(@Query('sector') sector?: string, @Query('city') city?: string) {
    return this.importService.exportClientsData({ sector, city });
  }

  @Get('activities/export/data')
  @Roles('ADMIN', 'SALES')
  exportActivitiesData(@Query('q') query?: string) {
    return this.importService.exportActivitiesData({ query });
  }

  @Get('template/combinada')
  @Roles('ADMIN', 'SALES')
  exportCombinedTemplate() {
    return this.importService.exportCombinedTemplate();
  }
}
