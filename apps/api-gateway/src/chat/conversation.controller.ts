import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOkResponse, ApiNoContentResponse } from '@nestjs/swagger';
import { ConversationService } from './conversation.service';
import {
  ConversationMessageDto,
  ConversationSummaryDto,
} from '../core/openapi-schemas';

@ApiTags('conversations')
@Controller('conversations')
export class ConversationController {
  constructor(private readonly conversations: ConversationService) {}

  @Get()
  @ApiOkResponse({ type: [ConversationSummaryDto] })
  list() {
    return this.conversations.list();
  }

  @Get(':id/messages')
  @ApiOkResponse({ type: [ConversationMessageDto] })
  getMessages(@Param('id', ParseUUIDPipe) id: string) {
    return this.conversations.getMessages(id);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiNoContentResponse()
  delete(@Param('id', ParseUUIDPipe) id: string) {
    return this.conversations.delete(id);
  }
}
