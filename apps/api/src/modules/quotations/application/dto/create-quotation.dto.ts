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

  @IsOptional()
  isOptional?: boolean;

  @IsOptional()
  @IsString()
  optionGroup?: string;

  @IsOptional()
  @IsString()
  optionLabel?: string;
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
  coverTitle?: string;

  @IsOptional()
  @IsString()
  executiveSummary?: string;

  @IsOptional()
  @IsString()
  serviceType?: string;

  @IsOptional()
  @IsString()
  templateType?: string;

  @IsOptional()
  @IsString()
  pricingRule?: string;

  @IsOptional()
  @IsNumber()
  validityDays?: number;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  reusableBlockIds?: string[];

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
  executiveSummary?: string;

  @IsOptional()
  @IsString()
  coverTitle?: string;

  @IsOptional()
  @IsString()
  serviceType?: string;

  @IsOptional()
  @IsString()
  templateType?: string;

  @IsOptional()
  @IsString()
  pricingRule?: string;

  @IsOptional()
  @IsNumber()
  validityDays?: number;

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

  @IsOptional()
  @IsString()
  coverTitle?: string;

  @IsOptional()
  @IsString()
  executiveSummary?: string;

  @IsOptional()
  @IsString()
  serviceType?: string;

  @IsOptional()
  @IsString()
  templateType?: string;

  @IsOptional()
  @IsString()
  pricingRule?: string;

  @IsOptional()
  @IsNumber()
  validityDays?: number;
}

export class UpdateQuotationTemplateDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CommercialSectionDto)
  sections!: CommercialSectionDto[];
}

export class CreateWorkItemCatalogDto {
  @IsString()
  name!: string;
}

export class UpdateWorkItemCatalogDto {
  @IsString()
  name!: string;
}

export class CreateReusableTextBlockDto {
  @IsString()
  name!: string;

  @IsString()
  type!: string;

  @IsString()
  content!: string;
}

export class UpdateReusableTextBlockDto {
  @IsString()
  name!: string;

  @IsString()
  type!: string;

  @IsString()
  content!: string;
}

export class CreateQuotationActivityDto {
  @IsOptional()
  @IsEnum(ActivityType)
  type?: ActivityType;

  @IsString()
  description!: string;
}
