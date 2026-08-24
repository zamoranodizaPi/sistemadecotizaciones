import { Module } from '@nestjs/common';
import { AiLearningController } from './presentation/controllers/ai-learning.controller';
import { AiLearningService } from './infrastructure/services/ai-learning.service';
import { AiLearningLogService } from './infrastructure/services/ai-learning-log.service';
import { ClientInsightsService } from './infrastructure/services/client-insights.service';

@Module({
  controllers: [AiLearningController],
  providers: [AiLearningService, AiLearningLogService, ClientInsightsService],
  exports: [AiLearningService, AiLearningLogService, ClientInsightsService],
})
export class AiLearningModule {}
