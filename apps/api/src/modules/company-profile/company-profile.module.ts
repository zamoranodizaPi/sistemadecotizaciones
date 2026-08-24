import { Module } from '@nestjs/common';
import { CompanyProfileService } from './infrastructure/services/company-profile.service';
import { CompanyProfileController } from './presentation/controllers/company-profile.controller';

@Module({
  providers: [CompanyProfileService],
  controllers: [CompanyProfileController],
  exports: [CompanyProfileService],
})
export class CompanyProfileModule {}
