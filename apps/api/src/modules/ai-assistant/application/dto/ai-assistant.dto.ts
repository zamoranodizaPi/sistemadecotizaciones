import { IsObject, IsOptional, IsString, IsUUID } from 'class-validator';

export class SuggestQuoteDto {
  @IsString()
  text!: string;
}

export class CreateAiDealDto {
  @IsString()
  text!: string;

  @IsUUID()
  clientId!: string;

  @IsOptional()
  @IsString()
  title?: string;
}

export class AiFeedbackDto {
  @IsString()
  input!: string;

  @IsObject()
  original!: Record<string, unknown>;

  @IsObject()
  corrected!: Record<string, unknown>;
}
