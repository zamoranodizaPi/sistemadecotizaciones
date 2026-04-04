import { Module } from '@nestjs/common';
import { PipelineController } from './presentation/controllers/pipeline.controller';
import { PipelineService } from './infrastructure/services/pipeline.service';

@Module({
  providers: [PipelineService],
  controllers: [PipelineController],
  exports: [PipelineService],
})
export class PipelineModule {}
