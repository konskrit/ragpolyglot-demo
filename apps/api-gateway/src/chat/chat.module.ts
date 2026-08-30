import { Module } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';
import { ConversationController } from './conversation.controller';
import { ConversationService } from './conversation.service';
import { CoreModule } from '../core/core.module';
import { RagModule } from '../rag/rag.module';

@Module({
  imports: [CoreModule, RagModule],
  controllers: [ConversationController],
  providers: [ChatGateway, ConversationService],
})
export class ChatModule {}
