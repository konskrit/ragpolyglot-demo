import type {
  DocumentChunk,
  DocumentSummary,
  OcrEngine,
  OcrLanguageOption,
} from '@ragpolyglot-shared';
import {
  isDocumentProgressStage,
  isOcrEngine,
  normalizeDocumentStatus,
} from '@ragpolyglot-shared';
import { getJson } from '../api/client';

function mapDocumentSummary(item: unknown): DocumentSummary | null {
  if (!item || typeof item !== 'object') return null;

  const row = item as Record<string, unknown>;
  if (typeof row.id !== 'string' || typeof row.title !== 'string') return null;

  return {
    id: row.id,
    title: row.title,
    fileExt: typeof row.fileExt === 'string' ? row.fileExt : undefined,
    status: normalizeDocumentStatus(row.status) ?? 'uploading',
    errorReason:
      typeof row.errorReason === 'string' ? row.errorReason : undefined,
    progressStage: isDocumentProgressStage(row.progressStage)
      ? row.progressStage
      : undefined,
    progressDone:
      typeof row.progressDone === 'number' ? row.progressDone : undefined,
    progressTotal:
      typeof row.progressTotal === 'number' ? row.progressTotal : undefined,
    ocrLang: typeof row.ocrLang === 'string' ? row.ocrLang : undefined,
    ocrEngine: isOcrEngine(row.ocrEngine) ? row.ocrEngine : undefined,
    createdAt: typeof row.createdAt === 'string' ? row.createdAt : undefined,
  };
}

export function mapApiDocuments(data: unknown): DocumentSummary[] {
  if (!Array.isArray(data)) return [];
  return data
    .map(mapDocumentSummary)
    .filter((doc): doc is DocumentSummary => doc !== null);
}

export function mapApiDocument(data: unknown): DocumentSummary | null {
  return mapDocumentSummary(data);
}

function mapApiChunk(item: unknown): DocumentChunk | null {
  if (!item || typeof item !== 'object') return null;
  const row = item as Record<string, unknown>;
  if (typeof row.documentId !== 'string') return null;
  if (typeof row.chunkIndex !== 'number') return null;
  if (typeof row.content !== 'string') return null;

  return {
    id: typeof row.id === 'number' ? row.id : undefined,
    documentId: row.documentId,
    chunkIndex: row.chunkIndex,
    content: row.content,
    createdAt: typeof row.createdAt === 'string' ? row.createdAt : undefined,
  };
}

export function mapApiChunks(data: unknown): DocumentChunk[] {
  if (!Array.isArray(data)) return [];
  return data
    .map(mapApiChunk)
    .filter((chunk): chunk is DocumentChunk => chunk !== null);
}

export function loadDocument(id: string): Promise<DocumentSummary | null> {
  return getJson<unknown>(`/api/documents/${encodeURIComponent(id)}`).then(
    mapApiDocument,
  );
}

export function loadDocumentChunks(id: string): Promise<DocumentChunk[]> {
  return getJson<unknown>(
    `/api/documents/${encodeURIComponent(id)}/chunks`,
  ).then(mapApiChunks);
}

const ocrLanguagesCache = new Map<string, Promise<OcrLanguageOption[]>>();

export function loadOcrLanguages(
  engine: OcrEngine = 'tesseract',
): Promise<OcrLanguageOption[]> {
  const cached = ocrLanguagesCache.get(engine);
  if (cached) return cached;

  const promise = getJson<OcrLanguageOption[]>(
    `/api/documents/ocr-languages?engine=${encodeURIComponent(engine)}`,
  )
    .then((langs) => {
      if (!Array.isArray(langs) || langs.length === 0) {
        ocrLanguagesCache.delete(engine);
        return [];
      }
      return langs;
    })
    .catch(() => {
      ocrLanguagesCache.delete(engine);
      return [];
    });

  ocrLanguagesCache.set(engine, promise);
  return promise;
}
