import { Module } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';
import { CoreModule } from '../core/core.module';
import { RagModule } from '../rag/rag.module';

@Module({
  imports: [CoreModule, RagModule],
  providers: [ChatGateway],
})
export class ChatModule {}
