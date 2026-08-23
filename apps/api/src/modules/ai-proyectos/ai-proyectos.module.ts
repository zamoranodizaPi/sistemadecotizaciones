import { Module } from '@nestjs/common';
import { QuotationsModule } from '../quotations/quotations.module';
import { AiProyectosController } from './presentation/controllers/ai-proyectos.controller';
import { AiProyectosService } from './infrastructure/services/ai-proyectos.service';

@Module({
  imports: [QuotationsModule],
  controllers: [AiProyectosController],
  providers: [AiProyectosService],
  exports: [AiProyectosService],
})
export class AiProyectosModule {}
