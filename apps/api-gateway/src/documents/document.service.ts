import {
  Injectable,
  Logger,
  BadRequestException,
  GoneException,
  InternalServerErrorException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { access, unlink } from 'fs/promises';
import { constants } from 'fs';
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

  async retryDocument(id: string): Promise<Document> {
    const existing = await firstValueFrom(
      this.httpService.get<DocumentRecord>(
        `${Config.documentServiceUrl}/api/documents/${encodeURIComponent(id)}`,
      ),
    );

    await this.assertUploadFileExists(existing.data.filePath);

    const res = await firstValueFrom(
      this.httpService.post<DocumentRecord>(
        `${Config.documentServiceUrl}/api/documents/${encodeURIComponent(id)}/retry`,
      ),
    );

    this.logger.log(`Document retry queued: ${id}`);
    return this.toPublicDocument(res.data);
  }

  async deleteDocument(id: string): Promise<void> {
    const existing = await firstValueFrom(
      this.httpService.get<DocumentRecord>(
        `${Config.documentServiceUrl}/api/documents/${encodeURIComponent(id)}`,
      ),
    );
    const filename = this.uploadFilename(existing.data.filePath);

    await firstValueFrom(
      this.httpService.delete(
        `${Config.documentServiceUrl}/api/documents/${encodeURIComponent(id)}`,
      ),
    );

    if (filename) {
      await unlink(join(Config.uploadsDir, filename)).catch(() => undefined);
    }
  }

  private uploadFilename(filePath?: string): string | null {
    if (!filePath) return null;
    const filename = basename(filePath);
    if (!filename || filename === '.' || filename === '..') return null;
    return filename;
  }

  private async assertUploadFileExists(filePath?: string): Promise<void> {
    const filename = this.uploadFilename(filePath);
    if (!filename) {
      throw new GoneException(
        'Original upload file is no longer available. Please upload again.',
      );
    }

    try {
      await access(join(Config.uploadsDir, filename), constants.F_OK);
    } catch {
      throw new GoneException(
        'Original upload file is no longer available. Please upload again.',
      );
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
      errorReason: doc.errorReason,
      uploadedBy: doc.uploadedBy,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }
}
