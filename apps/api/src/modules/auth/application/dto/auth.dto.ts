import { IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}

export class CreateUserDto {
  @IsString()
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  @IsIn(['ADMIN', 'EDITOR', 'VIEWER'])
  role!: 'ADMIN' | 'EDITOR' | 'VIEWER';
}

export class ConfirmPasswordDto {
  @IsString()
  @MinLength(8)
  password!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
