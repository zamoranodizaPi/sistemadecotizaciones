import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { ClientsModule } from '../clients/clients.module';
import { PipelineModule } from '../pipeline/pipeline.module';
import { QuotationsService } from './infrastructure/services/quotations.service';
import { PdfService } from './infrastructure/services/pdf.service';
import { QuotationsController } from './presentation/controllers/quotations.controller';

@Module({
  imports: [CatalogModule, ClientsModule, PipelineModule],
  providers: [QuotationsService, PdfService],
  controllers: [QuotationsController],
  exports: [QuotationsService],
})
export class QuotationsModule {}
