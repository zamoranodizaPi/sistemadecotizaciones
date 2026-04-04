import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ConfirmPasswordDto } from '../../../auth/application/dto/auth.dto';
import { AuthService } from '../../../auth/infrastructure/services/auth.service';
import { CurrentUser, type CurrentUserPayload } from '../../../auth/presentation/decorators/current-user.decorator';
import { Roles } from '../../../auth/presentation/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../auth/presentation/guards/jwt-auth.guard';
import { RolesGuard } from '../../../auth/presentation/guards/roles.guard';
import {
  CloneClientDto,
  CreateClientDto,
  UpdateClientDto,
} from '../../application/dto/create-client.dto';
import { ClientsService } from '../../infrastructure/services/clients.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('clients')
export class ClientsController {
  constructor(
    private readonly clientsService: ClientsService,
    private readonly authService: AuthService,
  ) {}

  @Get()
  list() {
    return this.clientsService.listClients();
  }

  @Post()
  @Roles('ADMIN', 'SALES')
  create(@Body() body: CreateClientDto) {
    return this.clientsService.createClient(body);
  }

  @Patch(':id')
  @Roles('ADMIN', 'SALES')
  update(@Param('id') id: string, @Body() body: UpdateClientDto) {
    return this.clientsService.updateClient(id, body);
  }

  @Post(':id/clone')
  @Roles('ADMIN', 'SALES')
  clone(@Param('id') id: string, @Body() body: CloneClientDto) {
    return this.clientsService.cloneClient(id, body);
  }

  @Delete(':id')
  @Roles('ADMIN')
  async delete(
    @Param('id') id: string,
    @Body() body: ConfirmPasswordDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    await this.authService.verifyAdminPassword(user.userId, body.password);
    return this.clientsService.deleteClient(id);
  }
}
