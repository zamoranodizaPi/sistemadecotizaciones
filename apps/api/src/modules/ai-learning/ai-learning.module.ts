import { Module } from '@nestjs/common';
import { AiLearningController } from './presentation/controllers/ai-learning.controller';
import { AiLearningService } from './infrastructure/services/ai-learning.service';

@Module({
  controllers: [AiLearningController],
  providers: [AiLearningService],
  exports: [AiLearningService],
})
export class AiLearningModule {}
