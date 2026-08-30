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
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { Config } from '../core/config';
import { DocumentService } from './document.service';

const ALLOWED_EXTENSIONS = new Set([
  '.txt',
  '.md',
  '.markdown',
  '.json',
  '.pdf',
]);

const storage = diskStorage({
  destination: Config.uploadsDir,
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `${uniqueSuffix}${extname(file.originalname).toLowerCase()}`);
  },
});

@Controller('documents')
export class DocumentController {
  constructor(private readonly documentService: DocumentService) {}

  @Get()
  getAllDocuments() {
    return this.documentService.getAllDocuments();
  }

  @Get('ocr-languages')
  getOcrLanguages() {
    return this.documentService.getOcrLanguages();
  }

  @Get(':id')
  getDocument(@Param('id') id: string) {
    return this.documentService.getDocumentById(id);
  }

  @Get(':id/chunks')
  getChunks(@Param('id') id: string) {
    return this.documentService.getDocumentChunks(id);
  }

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage,
      limits: { fileSize: Config.maxUploadBytes, files: 1 },
      fileFilter: (_req, file, cb) => {
        const ext = extname(file.originalname).toLowerCase();
        if (!ALLOWED_EXTENSIONS.has(ext)) {
          cb(
            new BadRequestException(
              `Unsupported file type "${ext}". Allowed: ${[...ALLOWED_EXTENSIONS].join(', ')}`,
            ),
            false,
          );
          return;
        }
        cb(null, true);
      },
    }),
  )
  uploadDocument(
    @UploadedFile() file: Express.Multer.File,
    @Body('title') title?: string,
  ) {
    return this.documentService.uploadDocument(file, title);
  }

  @Post(':id/retry')
  @HttpCode(200)
  retryDocument(@Param('id') id: string, @Body() body?: { ocrLang?: string }) {
    return this.documentService.retryDocument(id, body?.ocrLang);
  }

  @Post(':id/ocr-lang')
  @HttpCode(200)
  setOcrLang(@Param('id') id: string, @Body() body?: { ocrLang?: string }) {
    return this.documentService.setOcrLang(id, body?.ocrLang);
  }

  @Post(':id/pause')
  @HttpCode(202)
  pauseDocument(@Param('id') id: string) {
    return this.documentService.pauseDocument(id);
  }

  @Post(':id/resume')
  @HttpCode(200)
  resumeDocument(@Param('id') id: string) {
    return this.documentService.resumeDocument(id);
  }

  @Delete(':id')
  @HttpCode(200)
  deleteDocument(@Param('id') id: string) {
    return this.documentService.deleteDocument(id);
  }
}
