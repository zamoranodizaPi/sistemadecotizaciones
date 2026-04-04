import {
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class PricingProfileDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsString()
  code!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsNumber()
  sortOrder?: number;

  @IsOptional()
  @IsNumber()
  mxnPrice?: number;

  @IsOptional()
  @IsNumber()
  usdPrice?: number;

  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @IsOptional()
  @IsString()
  source?: string;
}

export class UpdatePricingProfilesDto {
  @IsUUID()
  serviceId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PricingProfileDto)
  profiles!: PricingProfileDto[];
}
