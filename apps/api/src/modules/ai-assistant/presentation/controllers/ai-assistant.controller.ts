import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { CurrentUser, type CurrentUserPayload } from '../../../auth/presentation/decorators/current-user.decorator';
import { Roles } from '../../../auth/presentation/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../auth/presentation/guards/jwt-auth.guard';
import { RolesGuard } from '../../../auth/presentation/guards/roles.guard';
import { AiFeedbackDto, CreateAiDealDto, SuggestQuoteDto } from '../../application/dto/ai-assistant.dto';
import { AiAssistantService } from '../../infrastructure/services/ai-assistant.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('ai')
export class AiAssistantController {
  constructor(private readonly aiAssistantService: AiAssistantService) {}

  @Post('suggest-quote')
  suggestQuote(@Body() body: SuggestQuoteDto) {
    return this.aiAssistantService.suggestQuote(body.text, body.mode);
  }

  @Post('create-deal')
  @Roles('ADMIN', 'SALES')
  createDeal(@Body() body: CreateAiDealDto, @CurrentUser() user: CurrentUserPayload) {
    return this.aiAssistantService.createDealFromSuggestion(
      body.text,
      body.clientId,
      user.userId,
      body.title,
      body.items,
      body.workItems,
      body.commercialText,
      body.mode,
    );
  }

  @Post('feedback')
  feedback(@Body() body: AiFeedbackDto) {
    return this.aiAssistantService.saveFeedback(body.input, body.original, body.corrected, body.mode);
  }
}
