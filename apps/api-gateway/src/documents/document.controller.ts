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

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

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
      limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
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

  @Delete(':id')
  @HttpCode(200)
  deleteDocument(@Param('id') id: string) {
    return this.documentService.deleteDocument(id);
  }
}
