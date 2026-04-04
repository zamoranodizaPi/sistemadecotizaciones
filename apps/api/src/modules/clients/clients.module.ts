import { Module } from '@nestjs/common';
import { ClientsService } from './infrastructure/services/clients.service';
import { ClientsController } from './presentation/controllers/clients.controller';

@Module({
  providers: [ClientsService],
  controllers: [ClientsController],
  exports: [ClientsService],
})
export class ClientsModule {}

