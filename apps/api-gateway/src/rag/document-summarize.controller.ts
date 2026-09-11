import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiProperty, ApiTags } from '@nestjs/swagger';
import type {
  DocumentSummarizeDto,
  DocumentSummarizeResult,
} from '@ragpolyglot-shared';
import { RagService } from './rag.service';

class DocumentSummarizeBodyDto {
  @ApiProperty({ required: false, example: 60000 })
  maxContextChars?: number;

  @ApiProperty({
    required: false,
    example: true,
    description: 'Embed summary as a searchable chunk (default true)',
  })
  persist?: boolean;
}

class DocumentSummarizeResultDto {
  @ApiProperty()
  documentId!: string;

  @ApiProperty()
  summary!: string;

  @ApiProperty()
  batchCount!: number;

  @ApiProperty()
  llmCalls!: number;

  @ApiProperty()
  persisted!: boolean;

  @ApiProperty()
  contextChars!: number;
}

@ApiTags('documents')
@Controller('documents')
export class DocumentSummarizeController {
  constructor(private readonly ragService: RagService) {}

  @Post(':id/summarize')
  @HttpCode(200)
  @ApiBody({ type: DocumentSummarizeBodyDto })
  @ApiOkResponse({ type: DocumentSummarizeResultDto })
  summarize(
    @Param('id') id: string,
    @Body() body?: DocumentSummarizeBodyDto,
  ): Promise<DocumentSummarizeResult> {
    const dto: DocumentSummarizeDto = {
      maxContextChars: body?.maxContextChars,
      persist: body?.persist,
    };
    return this.ragService.summarizeDocument(id, dto);
  }
}
