import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Roles } from '../../../auth/presentation/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../auth/presentation/guards/jwt-auth.guard';
import { RolesGuard } from '../../../auth/presentation/guards/roles.guard';
import { CreateAiLearningDatasetDto } from '../../application/dto/ai-learning-dataset.dto';
import {
  CreateAiLearningTrainingDto,
  PromoteTrainingDto,
} from '../../application/dto/ai-learning-training.dto';
import { CreateAiLearningPromptDto, UpdateAiLearningPromptDto } from '../../application/dto/ai-learning-prompt.dto';
import { AiLearningService } from '../../infrastructure/services/ai-learning.service';
import { ClientInsightsService } from '../../infrastructure/services/client-insights.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('ai-learning')
export class AiLearningController {
  constructor(
    private readonly aiLearningService: AiLearningService,
    private readonly clientInsightsService: ClientInsightsService,
  ) {}

  @Get('client-insights/:clientId')
  getClientInsights(@Param('clientId') clientId: string) {
    return this.clientInsightsService.getClientInsights(clientId);
  }

  @Get('health')
  getHealth() {
    return this.aiLearningService.getHealth();
  }

  @Get('prompts')
  listPrompts() {
    return this.aiLearningService.listPrompts();
  }

  @Post('prompts')
  @Roles('ADMIN', 'SALES')
  createPrompt(@Body() body: CreateAiLearningPromptDto) {
    return this.aiLearningService.createPrompt(body);
  }

  @Get('training')
  @Roles('ADMIN', 'SALES')
  listTraining() {
    return this.aiLearningService.listTrainingExamples();
  }

  @Patch('prompts/:id')
  @Roles('ADMIN', 'SALES')
  updatePrompt(@Param('id') id: string, @Body() body: UpdateAiLearningPromptDto) {
    return this.aiLearningService.updatePrompt(id, body);
  }

  @Delete('prompts/:id')
  @Roles('ADMIN', 'SALES')
  removePrompt(@Param('id') id: string) {
    return this.aiLearningService.removePrompt(id);
  }

  @Post('training-free')
  @Roles('ADMIN', 'SALES')
  createFreeTraining(@Body() body: CreateAiLearningTrainingDto) {
    return this.aiLearningService.createTrainingExample(body);
  }

  @Post('training-dataset')
  @Roles('ADMIN', 'SALES')
  createDatasetTraining(@Body() body: CreateAiLearningDatasetDto) {
    return this.aiLearningService.createTrainingFromDataset(body);
  }

  @Post('training-promote')
  @Roles('ADMIN', 'SALES')
  promoteTraining(@Body() body: PromoteTrainingDto) {
    return this.aiLearningService.promoteTrainingToRule(body);
  }

  @Delete('training/:id')
  @Roles('ADMIN', 'SALES')
  deleteTraining(@Param('id') id: string) {
    return this.aiLearningService.deleteTrainingExample(id);
  }
}
