import { Body, Controller, Get, Post, UseGuards, ValidationPipe } from '@nestjs/common';
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

  @Get('excel/export')
  @Roles('ADMIN', 'SALES')
  exportExcelTemplate() {
    return this.importService.exportCurrentCatalog();
  }
}
