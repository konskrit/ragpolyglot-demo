import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { Config } from '../core/config';
import { Document, DocumentChunk, DocumentCreateDto } from '@ragpolyglot-shared';

@Injectable()
export class DocumentService {
  private readonly logger = new Logger(DocumentService.name);

  constructor(private readonly httpService: HttpService) {}

  async getAllDocuments(): Promise<Document[]> {
    const res = await firstValueFrom(
      this.httpService.get(`${Config.documentServiceUrl}/api/documents`),
    );
    return res.data;
  }

  async getDocumentById(id: string): Promise<Document> {
    const res = await firstValueFrom(
      this.httpService.get(
        `${Config.documentServiceUrl}/api/documents/${encodeURIComponent(id)}`,
      ),
    );
    return res.data;
  }

  async getDocumentChunks(id: string): Promise<DocumentChunk[]> {
    const res = await firstValueFrom(
      this.httpService.get(
        `${Config.documentServiceUrl}/api/documents/${encodeURIComponent(id)}/chunks`,
      ),
    );
    return res.data;
  }

  async uploadDocument(
    file: Express.Multer.File,
    title?: string,
  ): Promise<Document> {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    const docTitle = title || file.originalname;
    const filePath = `/uploads/${file.filename}`;

    const res = await firstValueFrom(
      this.httpService.post(`${Config.documentServiceUrl}/api/documents`, {
        title: docTitle,
        filePath,
      } satisfies DocumentCreateDto),
    );

    this.logger.log(`Document created via document-service: ${res.data.id}`);
    return res.data as Document;
  }

  async deleteDocument(id: string): Promise<void> {
    await firstValueFrom(
      this.httpService.delete(
        `${Config.documentServiceUrl}/api/documents/${encodeURIComponent(id)}`,
      ),
    );
  }
}
