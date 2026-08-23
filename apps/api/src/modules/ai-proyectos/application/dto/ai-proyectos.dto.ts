import { IsBoolean, IsIn, IsNumber, IsObject, IsOptional, IsString, IsUUID, Max, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class CondicionesProyectoDto {
  @IsOptional()
  @IsString()
  @IsIn(['bajo', 'medio', 'alto'])
  complejidad?: 'bajo' | 'medio' | 'alto';

  @IsOptional()
  @IsString()
  @IsIn(['urbano', 'industrial', 'remoto'])
  zona?: 'urbano' | 'industrial' | 'remoto';

  @IsOptional()
  @IsString()
  @IsIn(['normal', 'urgente'])
  urgencia?: 'normal' | 'urgente';

  @IsOptional()
  @IsNumber()
  @Min(1.2)
  @Max(1.4)
  margen?: number;
}

export class GenerarProyectoDto {
  @IsString()
  descripcion!: string;

  @IsString()
  sector!: string;

  @IsOptional()
  @IsString()
  cliente?: string;

  @IsOptional()
  @IsString()
  nombre?: string;

  @IsOptional()
  @IsString()
  nivelComplejidad?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CondicionesProyectoDto)
  condiciones?: CondicionesProyectoDto;
}

export class GuardarTrainingExampleDto {
  @IsObject()
  input!: Record<string, unknown>;

  @IsObject()
  output!: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  aceptado?: boolean;
}

export class ConvertirProyectoQuotationDto {
  @IsUUID()
  clientId!: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  @IsIn(['MXN', 'USD'])
  currency?: 'MXN' | 'USD';
}
