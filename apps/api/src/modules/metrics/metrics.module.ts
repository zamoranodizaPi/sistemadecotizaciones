import { Module } from '@nestjs/common';
import { MetricsService } from './infrastructure/services/metrics.service';
import { MetricsController } from './presentation/controllers/metrics.controller';

@Module({
  providers: [MetricsService],
  controllers: [MetricsController],
})
export class MetricsModule {}

