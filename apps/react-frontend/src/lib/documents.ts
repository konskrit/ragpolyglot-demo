import type { Document, DocumentStatus } from '@ragpolyglot-shared';
import { normalizeDocumentStatus } from '@ragpolyglot-shared';

/** Client document row — subset of shared Document (no filePath). */
export type UiDocument = Pick<
  Document,
  | 'id'
  | 'title'
  | 'status'
  | 'errorReason'
  | 'progressStage'
  | 'progressDone'
  | 'progressTotal'
> & {
  createdAt?: string;
};

export function mapApiDocuments(data: unknown): UiDocument[] {
  if (!Array.isArray(data)) return [];

  return data
    .filter(
      (
        item,
      ): item is {
        id: string;
        title: string;
        status?: unknown;
        errorReason?: string;
        progressStage?: string;
        progressDone?: number;
        progressTotal?: number;
        createdAt?: string;
      } =>
        !!item &&
        typeof item === 'object' &&
        typeof (item as { id?: unknown }).id === 'string' &&
        typeof (item as { title?: unknown }).title === 'string',
    )
    .map((d) => ({
      id: d.id,
      title: d.title,
      status: (normalizeDocumentStatus(d.status) ??
        'uploading') as DocumentStatus,
      errorReason:
        typeof d.errorReason === 'string' ? d.errorReason : undefined,
      progressStage:
        typeof d.progressStage === 'string' ? d.progressStage : undefined,
      progressDone:
        typeof d.progressDone === 'number' ? d.progressDone : undefined,
      progressTotal:
        typeof d.progressTotal === 'number' ? d.progressTotal : undefined,
      createdAt: d.createdAt,
    }));
}

export function mapApiDocument(data: unknown): UiDocument | null {
  return mapApiDocuments([data])[0] ?? null;
}
