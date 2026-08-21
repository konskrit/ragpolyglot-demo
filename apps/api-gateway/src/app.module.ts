import { Module } from '@nestjs/common';
import { CoreModule } from './core/core.module';
import { DocumentModule } from './documents/document.module';
import { RagModule } from './rag/rag.module';
import { ChatModule } from './chat/chat.module';
import { HealthModule } from './health/health.module';
@Module({
  imports: [CoreModule, DocumentModule, RagModule, ChatModule, HealthModule],
})
export class AppModule {}
