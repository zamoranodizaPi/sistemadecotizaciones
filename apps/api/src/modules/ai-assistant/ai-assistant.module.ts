import { Module } from '@nestjs/common';
import { AiLearningModule } from '../ai-learning/ai-learning.module';
import { QuotationsModule } from '../quotations/quotations.module';
import { AiAssistantController } from './presentation/controllers/ai-assistant.controller';
import { AiAssistantService } from './infrastructure/services/ai-assistant.service';
import { AiService } from './infrastructure/services/ai.service';

@Module({
  imports: [QuotationsModule, AiLearningModule],
  controllers: [AiAssistantController],
  providers: [AiAssistantService, AiService],
})
export class AiAssistantModule {}
