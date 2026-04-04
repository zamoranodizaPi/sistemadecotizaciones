import { Module } from '@nestjs/common';
import { AiLearningService } from './infrastructure/services/ai-learning.service';

@Module({
  providers: [AiLearningService],
  exports: [AiLearningService],
})
export class AiLearningModule {}
