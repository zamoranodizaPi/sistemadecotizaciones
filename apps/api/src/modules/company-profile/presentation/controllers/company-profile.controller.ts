import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { Roles } from '../../../auth/presentation/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../auth/presentation/guards/jwt-auth.guard';
import { RolesGuard } from '../../../auth/presentation/guards/roles.guard';
import { UpdateCompanyProfileDto } from '../../application/dto/company-profile.dto';
import { CompanyProfileService } from '../../infrastructure/services/company-profile.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('company-profile')
export class CompanyProfileController {
  constructor(private readonly companyProfileService: CompanyProfileService) {}

  @Get()
  getProfile() {
    return this.companyProfileService.getProfile();
  }

  @Patch()
  @Roles('ADMIN', 'SALES')
  updateProfile(@Body() body: UpdateCompanyProfileDto) {
    return this.companyProfileService.updateProfile(body);
  }
}
