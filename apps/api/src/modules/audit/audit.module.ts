import { Module } from '@nestjs/common';
import { AuditController } from './presentation/controllers/audit.controller';
import { AuditService } from './infrastructure/services/audit.service';

@Module({
  providers: [AuditService],
  controllers: [AuditController],
})
export class AuditModule {}

