import type { DocumentSummary, OcrLanguageOption } from '@ragpolyglot-shared';
import {
  isDocumentProgressStage,
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

let ocrLanguagesPromise: Promise<OcrLanguageOption[]> | null = null;

export function loadOcrLanguages(): Promise<OcrLanguageOption[]> {
  if (!ocrLanguagesPromise) {
    ocrLanguagesPromise = getJson<OcrLanguageOption[]>(
      '/api/documents/ocr-languages',
    )
      .then((langs) => {
        if (!Array.isArray(langs) || langs.length === 0) {
          ocrLanguagesPromise = null;
          return [];
        }
        return langs;
      })
      .catch(() => {
        ocrLanguagesPromise = null;
        return [];
      });
  }
  return ocrLanguagesPromise;
}
