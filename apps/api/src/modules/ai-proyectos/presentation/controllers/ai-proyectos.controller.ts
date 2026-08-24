import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser, type CurrentUserPayload } from '../../../auth/presentation/decorators/current-user.decorator';
import { Roles } from '../../../auth/presentation/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../auth/presentation/guards/jwt-auth.guard';
import { RolesGuard } from '../../../auth/presentation/guards/roles.guard';
import {
  ConvertirProyectoQuotationDto,
  GenerarProyectoDto,
  GuardarTrainingExampleDto,
} from '../../application/dto/ai-proyectos.dto';
import { AiProyectosService } from '../../infrastructure/services/ai-proyectos.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('ai')
export class AiProyectosController {
  constructor(private readonly aiProyectosService: AiProyectosService) {}

  @Post('proyecto')
  @Roles('ADMIN', 'SALES')
  generarProyecto(@Body() body: GenerarProyectoDto) {
    return this.aiProyectosService.generarProyecto(body);
  }

  @Post('proyecto/training')
  @Roles('ADMIN', 'SALES')
  guardarTraining(@Body() body: GuardarTrainingExampleDto) {
    return this.aiProyectosService.guardarEjemplo(body.input, body.output, body.aceptado ?? null);
  }

  @Post('proyecto/:id/convert-to-quotation')
  @Roles('ADMIN', 'SALES')
  convertToQuotation(
    @Param('id') id: string,
    @Body() body: ConvertirProyectoQuotationDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.aiProyectosService.convertProyectoToQuotation(id, body, user.userId);
  }

  @Post('proyecto/:id/pdf')
  @Roles('ADMIN', 'SALES')
  generatePdf(@Param('id') id: string) {
    return this.aiProyectosService.generateProyectoPdf(id);
  }
}
