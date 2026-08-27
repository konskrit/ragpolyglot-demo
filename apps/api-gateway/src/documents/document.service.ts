import {
  Injectable,
  Logger,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { unlink } from 'fs/promises';
import { basename, join } from 'path';
import { Config } from '../core/config';
import {
  Document,
  DocumentChunk,
  DocumentCreateDto,
} from '@ragpolyglot-shared';

type DocumentRecord = Document & { filePath?: string };

@Injectable()
export class DocumentService {
  private readonly logger = new Logger(DocumentService.name);

  constructor(private readonly httpService: HttpService) {}

  async getAllDocuments(): Promise<Document[]> {
    const res = await firstValueFrom(
      this.httpService.get<DocumentRecord[]>(
        `${Config.documentServiceUrl}/api/documents`,
      ),
    );
    return res.data.map((d) => this.toPublicDocument(d));
  }

  async getDocumentById(id: string): Promise<Document> {
    const res = await firstValueFrom(
      this.httpService.get<DocumentRecord>(
        `${Config.documentServiceUrl}/api/documents/${encodeURIComponent(id)}`,
      ),
    );
    return this.toPublicDocument(res.data);
  }

  async getDocumentChunks(id: string): Promise<DocumentChunk[]> {
    const res = await firstValueFrom(
      this.httpService.get<DocumentChunk[]>(
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

    try {
      const res = await firstValueFrom(
        this.httpService.post<DocumentRecord>(
          `${Config.documentServiceUrl}/api/documents`,
          {
            title: docTitle,
            filePath,
          } satisfies DocumentCreateDto,
        ),
      );

      this.logger.log(`Document created via document-service: ${res.data.id}`);
      return this.toPublicDocument(res.data);
    } catch (err) {
      await unlink(join(Config.uploadsDir, file.filename)).catch(
        () => undefined,
      );
      throw err;
    }
  }

  async deleteDocument(id: string): Promise<void> {
    const existing = await firstValueFrom(
      this.httpService.get<DocumentRecord>(
        `${Config.documentServiceUrl}/api/documents/${encodeURIComponent(id)}`,
      ),
    );
    const filename = existing.data.filePath
      ? basename(existing.data.filePath)
      : '';

    await firstValueFrom(
      this.httpService.delete(
        `${Config.documentServiceUrl}/api/documents/${encodeURIComponent(id)}`,
      ),
    );

    if (filename && filename !== '.' && filename !== '..') {
      await unlink(join(Config.uploadsDir, filename)).catch(() => undefined);
    }
  }

  private toPublicDocument(doc: DocumentRecord): Document {
    if (!doc?.id) {
      throw new InternalServerErrorException('Invalid document payload');
    }
    return {
      id: doc.id,
      title: doc.title,
      status: doc.status,
      uploadedBy: doc.uploadedBy,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }
}
