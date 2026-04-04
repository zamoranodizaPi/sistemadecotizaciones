import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/infrastructure/prisma.service';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  listQuotationHistory(quotationId?: string) {
    return this.prisma.quotationHistory.findMany({
      where: quotationId ? { quotationId } : undefined,
      orderBy: { createdAt: 'desc' },
    });
  }
}

