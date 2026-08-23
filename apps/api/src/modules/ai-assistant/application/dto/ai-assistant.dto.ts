import { IsArray, IsNumber, IsObject, IsOptional, IsString, IsUUID, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class CreateAiDealItemDto {
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

export class SuggestQuoteDto {
  @IsString()
  text!: string;

  @IsOptional()
  @IsString()
  mode?: string;
}

export class CreateAiDealDto {
  @IsString()
  text!: string;

  @IsOptional()
  @IsString()
  mode?: string;

  @IsUUID()
  clientId!: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateAiDealItemDto)
  items?: CreateAiDealItemDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  workItems?: string[];

  @IsOptional()
  @IsString()
  commercialText?: string;
}

export class AiFeedbackDto {
  @IsString()
  input!: string;

  @IsOptional()
  @IsString()
  mode?: string;

  @IsObject()
  original!: Record<string, unknown>;

  @IsObject()
  corrected!: Record<string, unknown>;
}
