import { Module } from '@nestjs/common';
import { CatalogController } from './presentation/controllers/catalog.controller';
import { ImportController } from './presentation/controllers/import.controller';
import { CatalogService } from './infrastructure/services/catalog.service';
import { ExcelImportService } from './infrastructure/services/excel-import.service';

@Module({
  providers: [CatalogService, ExcelImportService],
  controllers: [CatalogController, ImportController],
  exports: [CatalogService],
})
export class CatalogModule {}

