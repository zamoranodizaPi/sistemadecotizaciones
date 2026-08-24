import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiLearningModule } from '../ai-learning/ai-learning.module';
import { QuotationsModule } from '../quotations/quotations.module';
import { AiAssistantController } from './presentation/controllers/ai-assistant.controller';
import { AiAssistantService } from './infrastructure/services/ai-assistant.service';
import { IntentParsingService } from './infrastructure/services/intent-parsing.service';
import { AI_PROVIDER, AiProvider } from './domain/ai-provider';
import { OpenAiProvider } from './infrastructure/providers/openai.provider';
import { AnthropicProvider } from './infrastructure/providers/anthropic.provider';

@Module({
  imports: [QuotationsModule, AiLearningModule],
  controllers: [AiAssistantController],
  providers: [
    AiAssistantService,
    IntentParsingService,
    OpenAiProvider,
    AnthropicProvider,
    {
      provide: AI_PROVIDER,
      useFactory: (
        configService: ConfigService,
        openAiProvider: OpenAiProvider,
        anthropicProvider: AnthropicProvider,
      ): AiProvider => {
        const selected = configService.get<string>('AI_PROVIDER_NAME') || 'anthropic';
        return selected === 'openai' ? openAiProvider : anthropicProvider;
      },
      inject: [ConfigService, OpenAiProvider, AnthropicProvider],
    },
  ],
})
export class AiAssistantModule {}
