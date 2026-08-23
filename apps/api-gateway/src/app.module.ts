import { Module } from '@nestjs/common';
import { CoreModule } from './core/core.module';
import { DocumentModule } from './documents/document.module';
import { RagModule } from './rag/rag.module';
import { ChatModule } from './chat/chat.module';
import { HealthModule } from './health/health.module';
import { MetricsModule } from './metrics/metrics.module';

@Module({
  imports: [
    CoreModule,
    DocumentModule,
    RagModule,
    ChatModule,
    HealthModule,
    MetricsModule,
  ],
})
export class AppModule {}
