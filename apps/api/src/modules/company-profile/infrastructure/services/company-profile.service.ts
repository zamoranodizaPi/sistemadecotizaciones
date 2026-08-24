import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/infrastructure/prisma.service';
import { UpdateCompanyProfileDto } from '../../application/dto/company-profile.dto';

@Injectable()
export class CompanyProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile() {
    const existing = await this.prisma.companyProfile.findFirst({
      orderBy: { createdAt: 'asc' },
    });

    if (existing) {
      return existing;
    }

    return this.prisma.companyProfile.create({
      data: {
        legalName: 'SISTEMAS ELECTRICOS ZARAGOZA',
        commercialName: 'SIEZA',
        brandShortName: 'SIEZA',
        tagline: 'energy solutions',
        logoUrl: '/brand/logo.png',
        rfc: 'SEZ121221V69',
        email: 'contacto@sieza.mx',
        address: 'Cda. Los Pinos No. 8 A, Francisco I. Madero, Cuautla, Morelos, CP 62744',
        country: 'MX',
      },
    });
  }

  async updateProfile(dto: UpdateCompanyProfileDto) {
    const current = await this.getProfile();

    return this.prisma.companyProfile.update({
      where: { id: current.id },
      data: {
        legalName: dto.legalName.trim(),
        commercialName: dto.commercialName?.trim() || null,
        brandShortName: dto.brandShortName?.trim() || null,
        tagline: dto.tagline?.trim() || null,
        logoUrl: dto.logoUrl?.trim() || null,
        rfc: dto.rfc?.trim() || null,
        email: dto.email?.trim() || null,
        phone: dto.phone?.trim() || null,
        website: dto.website?.trim() || null,
        address: dto.address?.trim() || null,
        city: dto.city?.trim() || null,
        state: dto.state?.trim() || null,
        country: dto.country?.trim() || 'MX',
        defaultDurationOfWork: dto.defaultDurationOfWork?.trim() || null,
        defaultTerms: dto.defaultTerms?.trim() || null,
      },
    });
  }
}
