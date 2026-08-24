import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateAiLearningPromptDto {
  @IsOptional()
  @IsString()
  mode?: string;

  @IsString()
  name!: string;

  @IsString()
  systemPrompt!: string;

  @IsOptional()
  @IsString()
  inputExample?: string;

  @IsOptional()
  @IsString()
  outputExample?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateAiLearningPromptDto {
  @IsOptional()
  @IsString()
  mode?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  systemPrompt?: string;

  @IsOptional()
  @IsString()
  inputExample?: string;

  @IsOptional()
  @IsString()
  outputExample?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
