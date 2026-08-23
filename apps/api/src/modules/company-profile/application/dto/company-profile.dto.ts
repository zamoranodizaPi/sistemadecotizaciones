import { IsOptional, IsString } from 'class-validator';

export class UpdateCompanyProfileDto {
  @IsString()
  legalName!: string;

  @IsOptional()
  @IsString()
  commercialName?: string;

  @IsOptional()
  @IsString()
  brandShortName?: string;

  @IsOptional()
  @IsString()
  tagline?: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;

  @IsOptional()
  @IsString()
  rfc?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  website?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  defaultDurationOfWork?: string;

  @IsOptional()
  @IsString()
  defaultTerms?: string;
}
