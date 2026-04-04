import {
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CreateUserDto, LoginDto } from '../../application/dto/auth.dto';
import { AuthService } from '../../infrastructure/services/auth.service';
import { CurrentUser, type CurrentUserPayload } from '../decorators/current-user.decorator';
import { Roles } from '../decorators/roles.decorator';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() body: LoginDto) {
    return this.authService.login(body.email, body.password);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get('me')
  me(@CurrentUser() user: CurrentUserPayload) {
    return this.authService.me(user.userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get('users')
  @Roles('ADMIN')
  users() {
    return this.authService.listUsers();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get('users/assignable')
  @Roles('ADMIN', 'SALES')
  assignableUsers() {
    return this.authService.listAssignableUsers();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Post('users')
  createUser(@Body() body: CreateUserDto) {
    return this.authService.createUser(body);
  }
}
