import { Controller, Post, Body } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { RagService } from './rag.service';
import { ChatResponseDto } from '../core/openapi-schemas';

@ApiTags('chat')
@Controller('chat')
export class RagController {
  constructor(private readonly ragService: RagService) {}

  @Post()
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        userId: { type: 'string' },
        topK: { type: 'integer', minimum: 1 },
      },
      required: ['message'],
    },
  })
  @ApiOkResponse({ type: ChatResponseDto })
  async chat(
    @Body() body: { message: string; userId?: string; topK?: number },
  ) {
    const ragResult = await this.ragService.search({
      query: body.message,
      topK: body.topK,
      userId: body.userId,
    });

    return {
      role: 'assistant',
      content: ragResult.answer,
      sources: ragResult.sources,
      cacheHit: ragResult.cacheHit ?? false,
      timestamp: new Date().toISOString(),
    };
  }
}
