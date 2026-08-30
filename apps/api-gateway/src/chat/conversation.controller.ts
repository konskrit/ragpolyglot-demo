import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ConversationService } from './conversation.service';

@Controller('conversations')
export class ConversationController {
  constructor(private readonly conversations: ConversationService) {}

  @Get()
  list() {
    return this.conversations.list();
  }

  @Get(':id/messages')
  getMessages(@Param('id', ParseUUIDPipe) id: string) {
    return this.conversations.getMessages(id);
  }

  @Delete(':id')
  @HttpCode(204)
  delete(@Param('id', ParseUUIDPipe) id: string) {
    return this.conversations.delete(id);
  }
}
