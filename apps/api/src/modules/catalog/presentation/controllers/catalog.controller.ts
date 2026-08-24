import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ConfirmPasswordDto } from '../../../auth/application/dto/auth.dto';
import { AuthService } from '../../../auth/infrastructure/services/auth.service';
import { CurrentUser, type CurrentUserPayload } from '../../../auth/presentation/decorators/current-user.decorator';
import { Roles } from '../../../auth/presentation/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../auth/presentation/guards/jwt-auth.guard';
import { RolesGuard } from '../../../auth/presentation/guards/roles.guard';
import {
  CloneServiceDto,
  CreateCategoryDto,
  CreateServiceDto,
  UpdateServiceDto,
} from '../../application/dto/create-service.dto';
import { UpdatePricingProfilesDto } from '../../application/dto/update-pricing-profiles.dto';
import { CatalogService } from '../../infrastructure/services/catalog.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('catalog')
export class CatalogController {
  constructor(
    private readonly catalogService: CatalogService,
    private readonly authService: AuthService,
  ) {}

  @Get()
  list() {
    return this.catalogService.listCatalog();
  }

  @Get('detected-services')
  listDetectedServices() {
    return this.catalogService.listDetectedServices();
  }

  @Post('categories')
  @Roles('ADMIN', 'SALES')
  createCategory(@Body() body: CreateCategoryDto) {
    return this.catalogService.createCategory(body);
  }

  @Post('services')
  @Roles('ADMIN', 'SALES')
  createService(@Body() body: CreateServiceDto) {
    return this.catalogService.createOrVersionService(body);
  }

  @Patch('services/:serviceId')
  @Roles('ADMIN', 'SALES')
  updateService(@Param('serviceId') serviceId: string, @Body() body: UpdateServiceDto) {
    return this.catalogService.updateService(serviceId, body);
  }

  @Post('services/:serviceId/clone')
  @Roles('ADMIN', 'SALES')
  cloneService(@Param('serviceId') serviceId: string, @Body() body: CloneServiceDto) {
    return this.catalogService.cloneService(serviceId, body);
  }

  @Post('pricing-profiles/bootstrap')
  @Roles('ADMIN', 'SALES')
  bootstrapProfiles() {
    return this.catalogService.bootstrapPricingProfiles();
  }

  @Patch('services/:serviceId/pricing-profiles')
  @Roles('ADMIN', 'SALES')
  updatePricingProfiles(
    @Param('serviceId') serviceId: string,
    @Body() body: Omit<UpdatePricingProfilesDto, 'serviceId'>,
  ) {
    return this.catalogService.updatePricingProfiles({
      serviceId,
      profiles: body.profiles,
    });
  }

  @Patch('detected-services/:id/status')
  @Roles('ADMIN', 'SALES')
  updateDetectedServiceStatus(
    @Param('id') id: string,
    @Body() body: { status: 'PENDING' | 'APPROVED' | 'DISMISSED' },
  ) {
    return this.catalogService.updateDetectedServiceStatus(id, body.status);
  }

  @Get('exchange-rate')
  getExchangeRate() {
    return this.catalogService.getExchangeRate();
  }

  @Post('exchange-rate/refresh')
  @Roles('ADMIN', 'SALES')
  refreshExchangeRate() {
    return this.catalogService.refreshExchangeRate();
  }

  @Patch('exchange-rate')
  @Roles('ADMIN', 'SALES')
  updateExchangeRate(@Body() body: { rate: number }) {
    return this.catalogService.updateExchangeRate(body.rate);
  }

  @Delete('services/:serviceId')
  @Roles('ADMIN')
  async deleteService(
    @Param('serviceId') serviceId: string,
    @Body() body: ConfirmPasswordDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    await this.authService.verifyAdminPassword(user.userId, body.password);
    return this.catalogService.deleteService(serviceId);
  }

  @Delete('categories/:categoryId')
  @Roles('ADMIN')
  async deleteCategory(
    @Param('categoryId') categoryId: string,
    @Body() body: ConfirmPasswordDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    await this.authService.verifyAdminPassword(user.userId, body.password);
    return this.catalogService.deleteCategory(categoryId);
  }

  @Delete()
  @Roles('ADMIN')
  async clear(@Body() body: ConfirmPasswordDto, @CurrentUser() user: CurrentUserPayload) {
    await this.authService.verifyAdminPassword(user.userId, body.password);
    return this.catalogService.clearCatalog();
  }
}
