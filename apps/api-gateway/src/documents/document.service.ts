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
import { basename, extname, join } from 'path';
import { Config } from '../core/config';
import {
  Document,
  DocumentChunk,
  DocumentCreateDto,
  OcrLanguageOption,
  isOcrLanguageCode,
} from '@ragpolyglot-shared';
import { shouldDiscardUploadAfterFailure } from './document-upload';

type DocumentRecord = Document & { filePath?: string };

@Injectable()
export class DocumentService {
  private readonly logger = new Logger(DocumentService.name);

  constructor(private readonly httpService: HttpService) {}

  async getAllDocuments(): Promise<Document[]> {
    const res = await firstValueFrom(
      this.httpService.get<DocumentRecord[]>(this.docsUrl()),
    );
    return res.data.map((d) => this.toPublicDocument(d));
  }

  async getDocumentById(id: string): Promise<Document> {
    const res = await firstValueFrom(
      this.httpService.get<DocumentRecord>(this.docsUrl(id)),
    );
    return this.toPublicDocument(res.data);
  }

  async getDocumentChunks(id: string): Promise<DocumentChunk[]> {
    const res = await firstValueFrom(
      this.httpService.get<DocumentChunk[]>(this.docsUrl(id, '/chunks')),
    );
    return res.data;
  }

  async getOcrLanguages(): Promise<OcrLanguageOption[]> {
    const res = await firstValueFrom(
      this.httpService.get<OcrLanguageOption[]>(
        `${Config.ragWorkerUrl}/api/ocr-languages`,
      ),
    );
    return Array.isArray(res.data) ? res.data : [];
  }

  async uploadDocument(
    file: Express.Multer.File,
    title?: string,
  ): Promise<Document> {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    try {
      const res = await firstValueFrom(
        this.httpService.post<DocumentRecord>(this.docsUrl(), {
          title: title || file.originalname,
          filePath: `/uploads/${file.filename}`,
        } satisfies DocumentCreateDto),
      );

      this.logger.log(`Document created via document-service: ${res.data.id}`);
      return this.toPublicDocument(res.data);
    } catch (err) {
      if (shouldDiscardUploadAfterFailure(err)) {
        await unlink(join(Config.uploadsDir, file.filename)).catch(
          () => undefined,
        );
      }
      throw err;
    }
  }

  async retryDocument(id: string, ocrLang?: string): Promise<Document> {
    const existing = await firstValueFrom(
      this.httpService.get<DocumentRecord>(this.docsUrl(id)),
    );
    await this.assertUploadFileExists(existing.data.filePath);
    const hint = this.normalizedOcrLang(ocrLang);

    const res = await firstValueFrom(
      this.httpService.post<DocumentRecord>(this.docsUrl(id, '/retry'), {
        ocrLang: hint,
      }),
    );

    this.logger.log(`Document retry queued: ${id}`);
    return this.toPublicDocument(res.data);
  }

  async setOcrLang(id: string, ocrLang?: string): Promise<Document> {
    const hint = this.normalizedOcrLang(ocrLang);

    const res = await firstValueFrom(
      this.httpService.post<DocumentRecord>(this.docsUrl(id, '/ocr-lang'), {
        ocrLang: hint,
      }),
    );

    this.logger.log(`Document OCR language change queued: ${id}`);
    return this.toPublicDocument(res.data);
  }

  async pauseDocument(id: string): Promise<Document> {
    const res = await firstValueFrom(
      this.httpService.post<DocumentRecord>(this.docsUrl(id, '/pause')),
    );
    this.logger.log(`Document pause requested: ${id}`);
    return this.toPublicDocument(res.data);
  }

  async resumeDocument(id: string): Promise<Document> {
    const existing = await firstValueFrom(
      this.httpService.get<DocumentRecord>(this.docsUrl(id)),
    );
    await this.assertUploadFileExists(existing.data.filePath);

    const res = await firstValueFrom(
      this.httpService.post<DocumentRecord>(this.docsUrl(id, '/resume')),
    );

    this.logger.log(`Document resume queued: ${id}`);
    return this.toPublicDocument(res.data);
  }

  async deleteDocument(id: string): Promise<void> {
    const existing = await firstValueFrom(
      this.httpService.get<DocumentRecord>(this.docsUrl(id)),
    );
    const filename = this.uploadFilename(existing.data.filePath);

    await firstValueFrom(this.httpService.delete(this.docsUrl(id)));

    if (filename) {
      await unlink(join(Config.uploadsDir, filename)).catch(() => undefined);
    }
  }

  private docsUrl(id?: string, suffix = ''): string {
    const base = `${Config.documentServiceUrl}/api/documents`;
    return id ? `${base}/${encodeURIComponent(id)}${suffix}` : base;
  }

  private normalizedOcrLang(ocrLang?: string): string | null {
    const hint = ocrLang?.trim();
    if (hint && !isOcrLanguageCode(hint)) {
      throw new BadRequestException('Invalid OCR language code');
    }
    return hint || null;
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
      fileExt: this.fileExt(doc.filePath),
      status: doc.status,
      errorReason: doc.errorReason,
      progressStage: doc.progressStage,
      progressDone: doc.progressDone,
      progressTotal: doc.progressTotal,
      uploadedBy: doc.uploadedBy,
      ocrLang: doc.ocrLang,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  private fileExt(filePath?: string): string | undefined {
    const filename = this.uploadFilename(filePath);
    if (!filename) return undefined;
    const ext = extname(filename).toLowerCase().replace(/^\./, '');
    return ext || undefined;
  }
}
