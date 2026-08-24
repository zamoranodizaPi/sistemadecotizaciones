import { Module } from '@nestjs/common';
import { AiLearningController } from './presentation/controllers/ai-learning.controller';
import { AiLearningService } from './infrastructure/services/ai-learning.service';
import { AiLearningLogService } from './infrastructure/services/ai-learning-log.service';

@Module({
  controllers: [AiLearningController],
  providers: [AiLearningService, AiLearningLogService],
  exports: [AiLearningService, AiLearningLogService],
})
export class AiLearningModule {}
