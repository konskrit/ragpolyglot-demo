import type { Document, DocumentStatus } from '@ragpolyglot-shared';
import { normalizeDocumentStatus } from '@ragpolyglot-shared';

/** Client document row — subset of shared Document (no filePath). */
export type UiDocument = Pick<Document, 'id' | 'title' | 'status'> & {
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
      createdAt: d.createdAt,
    }));
}
