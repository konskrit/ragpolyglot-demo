import { Controller, Post, Body } from '@nestjs/common';
import { RagService } from './rag.service';

@Controller('chat')
export class RagController {
  constructor(private readonly ragService: RagService) {}

  @Post()
  async chat(@Body() body: { message: string; userId?: string; topK?: number }) {
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
