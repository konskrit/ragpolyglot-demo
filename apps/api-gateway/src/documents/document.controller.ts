import {
  Controller,
  Get,
  Post,
  Delete,
  UploadedFile,
  UseInterceptors,
  Body,
  Param,
  HttpCode,
} from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { DocumentService } from './document.service';
import { uploadInterceptorOptions } from './document-upload';
import {
  DocumentChunkDto,
  DocumentSummaryDto,
  OcrLangBodyDto,
  OcrLanguageOptionDto,
} from '../core/openapi-schemas';

@ApiTags('documents')
@Controller('documents')
export class DocumentController {
  constructor(private readonly documentService: DocumentService) {}

  @Get()
  @ApiOkResponse({ type: [DocumentSummaryDto] })
  getAllDocuments() {
    return this.documentService.getAllDocuments();
  }

  @Get('ocr-languages')
  @ApiOkResponse({ type: [OcrLanguageOptionDto] })
  getOcrLanguages() {
    return this.documentService.getOcrLanguages();
  }

  @Get(':id')
  @ApiOkResponse({ type: DocumentSummaryDto })
  getDocument(@Param('id') id: string) {
    return this.documentService.getDocumentById(id);
  }

  @Get(':id/chunks')
  @ApiOkResponse({ type: [DocumentChunkDto] })
  getChunks(@Param('id') id: string) {
    return this.documentService.getDocumentChunks(id);
  }

  @Post('upload')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        title: { type: 'string' },
      },
      required: ['file'],
    },
  })
  @UseInterceptors(FileInterceptor('file', uploadInterceptorOptions))
  @ApiOkResponse({ type: DocumentSummaryDto })
  uploadDocument(
    @UploadedFile() file: Express.Multer.File,
    @Body('title') title?: string,
  ) {
    return this.documentService.uploadDocument(file, title);
  }

  @Post(':id/retry')
  @HttpCode(200)
  @ApiBody({ type: OcrLangBodyDto })
  @ApiOkResponse({ type: DocumentSummaryDto })
  retryDocument(@Param('id') id: string, @Body() body?: OcrLangBodyDto) {
    return this.documentService.retryDocument(id, body?.ocrLang ?? undefined);
  }

  @Post(':id/ocr-lang')
  @HttpCode(200)
  @ApiBody({ type: OcrLangBodyDto })
  @ApiOkResponse({ type: DocumentSummaryDto })
  setOcrLang(@Param('id') id: string, @Body() body?: OcrLangBodyDto) {
    return this.documentService.setOcrLang(id, body?.ocrLang ?? undefined);
  }

  @Post(':id/pause')
  @HttpCode(202)
  @ApiOkResponse({ type: DocumentSummaryDto })
  pauseDocument(@Param('id') id: string) {
    return this.documentService.pauseDocument(id);
  }

  @Post(':id/resume')
  @HttpCode(200)
  @ApiOkResponse({ type: DocumentSummaryDto })
  resumeDocument(@Param('id') id: string) {
    return this.documentService.resumeDocument(id);
  }

  @Delete(':id')
  @HttpCode(200)
  deleteDocument(@Param('id') id: string) {
    return this.documentService.deleteDocument(id);
  }
}
