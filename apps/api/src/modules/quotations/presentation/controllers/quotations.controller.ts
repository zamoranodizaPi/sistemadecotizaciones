import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { QuotationStatus } from '@prisma/client';
import { ConfirmPasswordDto } from '../../../auth/application/dto/auth.dto';
import { AuthService } from '../../../auth/infrastructure/services/auth.service';
import { CurrentUser, type CurrentUserPayload } from '../../../auth/presentation/decorators/current-user.decorator';
import { Roles } from '../../../auth/presentation/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../auth/presentation/guards/jwt-auth.guard';
import { RolesGuard } from '../../../auth/presentation/guards/roles.guard';
import {
  CreateReusableTextBlockDto,
  CreateWorkItemCatalogDto,
  CreateQuotationActivityDto,
  CreateQuotationDto,
  UpdateQuotationDto,
  UpdateReusableTextBlockDto,
  UpdateWorkItemCatalogDto,
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

  @Get('reusable-text-blocks')
  reusableTextBlocks() {
    return this.quotationsService.listReusableTextBlocks();
  }

  @Post('work-items/catalog')
  @Roles('ADMIN', 'SALES')
  createWorkItemCatalog(@Body() body: CreateWorkItemCatalogDto) {
    return this.quotationsService.createWorkItemCatalog(body);
  }

  @Patch('work-items/catalog/:id')
  @Roles('ADMIN', 'SALES')
  updateWorkItemCatalog(@Param('id') id: string, @Body() body: UpdateWorkItemCatalogDto) {
    return this.quotationsService.updateWorkItemCatalog(id, body);
  }

  @Delete('work-items/catalog/:id')
  @Roles('ADMIN', 'SALES')
  deleteWorkItemCatalog(@Param('id') id: string) {
    return this.quotationsService.deleteWorkItemCatalog(id);
  }

  @Post('reusable-text-blocks')
  @Roles('ADMIN', 'SALES')
  createReusableTextBlock(@Body() body: CreateReusableTextBlockDto) {
    return this.quotationsService.createReusableTextBlock(body);
  }

  @Patch('reusable-text-blocks/:id')
  @Roles('ADMIN', 'SALES')
  updateReusableTextBlock(@Param('id') id: string, @Body() body: UpdateReusableTextBlockDto) {
    return this.quotationsService.updateReusableTextBlock(id, body);
  }

  @Delete('reusable-text-blocks/:id')
  @Roles('ADMIN', 'SALES')
  deleteReusableTextBlock(@Param('id') id: string) {
    return this.quotationsService.deleteReusableTextBlock(id);
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

  @Post(':id/duplicate')
  @Roles('ADMIN', 'SALES')
  duplicate(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.quotationsService.duplicateQuotation(id, user.userId);
  }

  @Post(':id/mark-sent')
  @Roles('ADMIN', 'SALES')
  markSent(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.quotationsService.markQuotationInteraction(id, 'sent', user.userId);
  }

  @Post(':id/mark-viewed')
  @Roles('ADMIN', 'SALES')
  markViewed(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.quotationsService.markQuotationInteraction(id, 'viewed', user.userId);
  }

  @Post(':id/mark-accepted')
  @Roles('ADMIN', 'SALES')
  markAccepted(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.quotationsService.markQuotationInteraction(id, 'accepted', user.userId);
  }

  @Post(':id/mark-rejected')
  @Roles('ADMIN', 'SALES')
  markRejected(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.quotationsService.markQuotationInteraction(id, 'rejected', user.userId);
  }

  @Post(':id/approve-discount')
  @Roles('ADMIN')
  approveDiscount(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.quotationsService.resolveQuotationApproval(id, 'APPROVED', user.userId);
  }

  @Post(':id/reject-discount')
  @Roles('ADMIN')
  rejectDiscount(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.quotationsService.resolveQuotationApproval(id, 'REJECTED', user.userId);
  }

  @Post(':id/convert-to-work-order')
  @Roles('ADMIN', 'SALES')
  convertToWorkOrder(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.quotationsService.convertQuotationToWorkOrder(id, user.userId);
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
