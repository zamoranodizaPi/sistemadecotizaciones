import type { CompanyProfileResponse } from '@/lib/api/types';

export const DEFAULT_COMPANY_LOGO = '/brand/logo.png';

type CompanyBrandSource = Partial<
  Pick<CompanyProfileResponse, 'commercialName' | 'brandShortName' | 'tagline' | 'logoUrl'>
> | null | undefined;

export function resolveCompanyBrandName(company?: CompanyBrandSource) {
  return company?.brandShortName?.trim() || company?.commercialName?.trim() || 'SIEZA';
}

export function resolveCompanyTagline(company?: CompanyBrandSource) {
  return company?.tagline?.trim() || 'energy solutions';
}

export function resolveCompanyLogo(company?: CompanyBrandSource) {
  return company?.logoUrl?.trim() || DEFAULT_COMPANY_LOGO;
}
