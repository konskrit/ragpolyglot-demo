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
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { Config } from '../core/config';
import { DocumentService } from './document.service';

const storage = diskStorage({
  destination: Config.uploadsDir,
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `${uniqueSuffix}${extname(file.originalname)}`);
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
  @UseInterceptors(FileInterceptor('file', { storage }))
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
