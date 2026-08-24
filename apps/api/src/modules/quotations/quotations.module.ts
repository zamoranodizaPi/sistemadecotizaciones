import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { ClientsModule } from '../clients/clients.module';
import { CompanyProfileModule } from '../company-profile/company-profile.module';
import { PipelineModule } from '../pipeline/pipeline.module';
import { AiLearningModule } from '../ai-learning/ai-learning.module';
import { QuotationsService } from './infrastructure/services/quotations.service';
import { PdfService } from './infrastructure/services/pdf.service';
import { ReporteWordService } from './infrastructure/services/reporte-word.service';
import { QuotationsController } from './presentation/controllers/quotations.controller';

@Module({
  imports: [
    CatalogModule,
    ClientsModule,
    CompanyProfileModule,
    PipelineModule,
    AiLearningModule,
  ],
  providers: [QuotationsService, PdfService, ReporteWordService],
  controllers: [QuotationsController],
  exports: [QuotationsService, PdfService, ReporteWordService],
})
export class QuotationsModule {}
