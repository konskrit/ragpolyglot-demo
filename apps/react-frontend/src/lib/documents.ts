import type { DocumentStatus } from '@ragpolyglot-shared';
import { normalizeDocumentStatus } from '@ragpolyglot-shared';

export interface UiDocument {
  id: string;
  title: string;
  status: DocumentStatus;
  createdAt?: string;
}

export interface ApiDocument {
  id: string;
  title: string;
  status: unknown;
  createdAt?: string;
}

export function mapApiDocuments(data: unknown): UiDocument[] {
  if (!Array.isArray(data)) return [];

  return data
    .filter(
      (item): item is ApiDocument =>
        !!item &&
        typeof item === 'object' &&
        typeof (item as ApiDocument).id === 'string' &&
        typeof (item as ApiDocument).title === 'string',
    )
    .map((d) => ({
      id: d.id,
      title: d.title,
      status: normalizeDocumentStatus(d.status) ?? 'uploading',
      createdAt: d.createdAt,
    }));
}

export function formatSimilarityPercent(similarity: number): string {
  if (!Number.isFinite(similarity)) return '—';
  const pct = similarity <= 1 ? similarity * 100 : similarity;
  return `${pct.toFixed(1)}%`;
}
