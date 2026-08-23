import { IsBoolean, IsObject, IsOptional, IsString } from 'class-validator';

export class CreateAiLearningTrainingDto {
  @IsObject()
  input!: Record<string, unknown>;

  @IsObject()
  output!: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  aceptado?: boolean;
}

export class PromoteTrainingDto {
  @IsObject()
  input!: Record<string, unknown>;

  @IsObject()
  output!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  mode?: string;
}
