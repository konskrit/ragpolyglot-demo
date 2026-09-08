import { Module } from '@nestjs/common';
import { CoreModule } from './core/core.module';
import { DocumentModule } from './documents/document.module';
import { RagModule } from './rag/rag.module';
import { ChatModule } from './chat/chat.module';
import { HealthModule } from './health/health.module';
import { MetricsModule } from './metrics/metrics.module';
import { RuntimeConfigModule } from './config/runtime-config.module';

@Module({
  imports: [
    CoreModule,
    DocumentModule,
    RagModule,
    ChatModule,
    HealthModule,
    MetricsModule,
    RuntimeConfigModule,
  ],
})
export class AppModule {}
