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
import { RedisService } from '../core/redis.service';
import { getDeepJob } from './chat-deep-job';

@ApiTags('conversations')
@Controller('conversations')
export class ConversationController {
  constructor(
    private readonly conversations: ConversationService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  @ApiOkResponse({ type: [ConversationSummaryDto] })
  list() {
    return this.conversations.list();
  }

  @Get(':id/deep')
  async getDeepStatus(@Param('id', ParseUUIDPipe) id: string) {
    const job = await getDeepJob(this.redis, id);
    if (!job) {
      return { running: false as const };
    }
    return {
      running: true as const,
      query: job.query,
      done: job.done,
      total: job.total,
    };
  }

  @Get(':id/messages')
  @ApiOkResponse({ type: [ConversationMessageDto] })
  getMessages(@Param('id', ParseUUIDPipe) id: string) {
    return this.conversations.getMessages(id);
  }

  @Get(':id')
  @ApiOkResponse({ type: ConversationSummaryDto })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.conversations.get(id);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiNoContentResponse()
  delete(@Param('id', ParseUUIDPipe) id: string) {
    return this.conversations.delete(id);
  }
}
