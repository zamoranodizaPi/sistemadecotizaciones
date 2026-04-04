import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { QuotationStatus } from '@prisma/client';
import { ConfirmPasswordDto } from '../../../auth/application/dto/auth.dto';
import { AuthService } from '../../../auth/infrastructure/services/auth.service';
import { CurrentUser, type CurrentUserPayload } from '../../../auth/presentation/decorators/current-user.decorator';
import { Roles } from '../../../auth/presentation/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../auth/presentation/guards/jwt-auth.guard';
import { RolesGuard } from '../../../auth/presentation/guards/roles.guard';
import {
  CreateQuotationActivityDto,
  CreateQuotationDto,
  UpdateQuotationDto,
  UpdateQuotationTemplateDto,
  UpdateQuotationCommercialDto,
} from '../../application/dto/create-quotation.dto';
import { QuotationsService } from '../../infrastructure/services/quotations.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('quotations')
export class QuotationsController {
  constructor(
    private readonly quotationsService: QuotationsService,
    private readonly authService: AuthService,
  ) {}

  @Get()
  list() {
    return this.quotationsService.listQuotations();
  }

  @Get('template')
  template() {
    return this.quotationsService.getCommercialTemplate();
  }

  @Get('special-considerations/catalog')
  specialConsiderationCatalog() {
    return this.quotationsService.listSpecialConsiderationCatalog();
  }

  @Get('service-templates')
  serviceTemplates() {
    return this.quotationsService.listServiceTemplates();
  }

  @Get('work-items/catalog')
  workItemsCatalog() {
    return this.quotationsService.listWorkItemCatalog();
  }

  @Post()
  @Roles('ADMIN', 'SALES')
  create(@Body() body: CreateQuotationDto, @CurrentUser() user: CurrentUserPayload) {
    return this.quotationsService.createQuotation(body, user.userId);
  }

  @Patch('template')
  @Roles('ADMIN', 'SALES')
  updateTemplate(@Body() body: UpdateQuotationTemplateDto) {
    return this.quotationsService.updateCommercialTemplate(body);
  }

  @Patch(':id')
  @Roles('ADMIN', 'SALES')
  update(@Param('id') id: string, @Body() body: UpdateQuotationDto, @CurrentUser() user: CurrentUserPayload) {
    return this.quotationsService.updateQuotation(id, body, user.userId);
  }

  @Patch(':id/builder')
  @Roles('ADMIN', 'SALES')
  updateFromBuilder(
    @Param('id') id: string,
    @Body() body: CreateQuotationDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.quotationsService.updateQuotationFromBuilder(id, body, user.userId);
  }

  @Patch(':id/status/:status')
  @Roles('ADMIN', 'SALES')
  changeStatus(
    @Param('id') id: string,
    @Param('status') status: QuotationStatus,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.quotationsService.changeStatus(id, status, user.userId);
  }

  @Patch(':id/commercial')
  @Roles('ADMIN', 'SALES')
  updateCommercial(
    @Param('id') id: string,
    @Body() body: UpdateQuotationCommercialDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.quotationsService.updateCommercialTerms(id, body, user.userId);
  }

  @Get(':id/activities')
  activities(@Param('id') id: string) {
    return this.quotationsService.listActivities(id);
  }

  @Post(':id/activities')
  @Roles('ADMIN', 'SALES')
  createActivity(
    @Param('id') id: string,
    @Body() body: CreateQuotationActivityDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.quotationsService.createActivity(id, body, user.userId);
  }

  @Post(':id/pdf')
  pdf(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.quotationsService.generatePdf(id, user.userId);
  }

  @Post(':id/pdf/simple')
  pdfSimple(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.quotationsService.generateSimplifiedPdf(id, user.userId);
  }

  @Delete(':id')
  @Roles('ADMIN')
  async delete(
    @Param('id') id: string,
    @Body() body: ConfirmPasswordDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    await this.authService.verifyAdminPassword(user.userId, body.password);
    return this.quotationsService.deleteQuotation(id);
  }
}
