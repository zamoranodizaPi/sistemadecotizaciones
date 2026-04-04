import {
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class ContactDto {
  @IsString()
  fullName!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  position?: string;
}

export class CreateClientDto {
  @IsString()
  legalName!: string;

  @IsOptional()
  @IsString()
  commercialName?: string;

  @IsString()
  rfc!: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContactDto)
  contacts!: ContactDto[];
}

export class UpdateClientDto {
  @IsString()
  legalName!: string;

  @IsOptional()
  @IsString()
  commercialName?: string;

  @IsString()
  rfc!: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContactDto)
  contacts!: ContactDto[];
}

export class CloneClientDto {
  @IsString()
  legalName!: string;

  @IsOptional()
  @IsString()
  commercialName?: string;

  @IsString()
  rfc!: string;

  @IsOptional()
  @IsString()
  address?: string;
}
