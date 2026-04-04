import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../../auth/presentation/guards/jwt-auth.guard';
import { RolesGuard } from '../../../auth/presentation/guards/roles.guard';
import { PipelineService } from '../../infrastructure/services/pipeline.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('pipeline')
export class PipelineController {
  constructor(private readonly pipelineService: PipelineService) {}

  @Get()
  summary() {
    return this.pipelineService.getPipelineSummary();
  }

  @Get('kanban')
  kanban() {
    return this.pipelineService.getKanban();
  }
}
