import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBody,
  ApiOkResponse,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import type { DocumentSummarizeDto } from '@ragpolyglot-shared';
import { DocumentService } from './document.service';
import { DocumentSummaryDto } from '../core/openapi-schemas';

class DocumentSummarizeBodyDto {
  @ApiProperty({ required: false, example: 20000 })
  maxContextChars?: number;
}

@ApiTags('documents')
@Controller('documents')
export class DocumentSummarizeController {
  constructor(private readonly documentService: DocumentService) {}

  @Post(':id/summarize')
  @HttpCode(202)
  @ApiBody({ type: DocumentSummarizeBodyDto })
  @ApiAcceptedResponse({ type: DocumentSummaryDto })
  startSummarize(
    @Param('id') id: string,
    @Body() body?: DocumentSummarizeBodyDto,
  ) {
    const dto: DocumentSummarizeDto = {
      maxContextChars: body?.maxContextChars,
    };
    return this.documentService.startSummarize(id, dto);
  }

  @Post(':id/summarize/pause')
  @HttpCode(200)
  @ApiOkResponse({ type: DocumentSummaryDto })
  pauseSummarize(@Param('id') id: string) {
    return this.documentService.pauseSummarize(id);
  }

  @Post(':id/summarize/resume')
  @HttpCode(200)
  @ApiOkResponse({ type: DocumentSummaryDto })
  resumeSummarize(@Param('id') id: string) {
    return this.documentService.resumeSummarize(id);
  }
}
