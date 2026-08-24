import { Module } from '@nestjs/common';
import { AiLearningModule } from '../ai-learning/ai-learning.module';
import { QuotationsModule } from '../quotations/quotations.module';
import { AiAssistantController } from './presentation/controllers/ai-assistant.controller';
import { AiAssistantService } from './infrastructure/services/ai-assistant.service';
import { IntentParsingService } from './infrastructure/services/intent-parsing.service';
import { AI_PROVIDER } from './domain/ai-provider';
import { OpenAiProvider } from './infrastructure/providers/openai.provider';

@Module({
  imports: [QuotationsModule, AiLearningModule],
  controllers: [AiAssistantController],
  providers: [
    AiAssistantService,
    IntentParsingService,
    { provide: AI_PROVIDER, useClass: OpenAiProvider },
  ],
})
export class AiAssistantModule {}
