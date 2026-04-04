import {
  IsEnum,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ActivityType, SpecialConsiderationType } from '@prisma/client';

class QuotationItemDto {
  @IsUUID()
  serviceId!: string;

  @IsUUID()
  pricingProfileId!: string;

  @IsNumber()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPriceOverride?: number;
}

class CommercialSectionDto {
  @IsString()
  title!: string;

  @IsString()
  content!: string;
}

class SpecialConsiderationDto {
  @IsEnum(SpecialConsiderationType)
  type!: SpecialConsiderationType;

  @IsOptional()
  @IsString()
  concept?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  quantity?: number;

  @IsOptional()
  @IsNumber()
  percentage?: number;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsNumber()
  mxnAmount?: number;

  @IsOptional()
  @IsNumber()
  usdAmount?: number;

  @IsOptional()
  @IsNumber()
  sortOrder?: number;
}

export class CreateQuotationDto {
  @IsUUID()
  clientId!: string;

  @IsOptional()
  @IsUUID()
  createdById?: string;

  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  durationOfWork?: string;

  @IsOptional()
  @IsString()
  termsAndConditions?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CommercialSectionDto)
  commercialSections?: CommercialSectionDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SpecialConsiderationDto)
  specialConsiderations?: SpecialConsiderationDto[];

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsNumber()
  exchangeRate?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuotationItemDto)
  items!: QuotationItemDto[];
}

export class UpdateQuotationCommercialDto {
  @IsOptional()
  @IsString()
  durationOfWork?: string;

  @IsOptional()
  @IsString()
  termsAndConditions?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CommercialSectionDto)
  commercialSections?: CommercialSectionDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SpecialConsiderationDto)
  specialConsiderations?: SpecialConsiderationDto[];
}

export class UpdateQuotationDto {
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateQuotationTemplateDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CommercialSectionDto)
  sections!: CommercialSectionDto[];
}

export class CreateQuotationActivityDto {
  @IsOptional()
  @IsEnum(ActivityType)
  type?: ActivityType;

  @IsString()
  description!: string;
}
