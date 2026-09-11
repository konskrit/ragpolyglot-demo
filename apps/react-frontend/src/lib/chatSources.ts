import { chunkAnchorId } from './chunkAnchor';
import type { DocumentSummary, Source } from '@ragpolyglot-shared';

export function sourceLabel(
  source: Source,
  documents: DocumentSummary[],
): string {
  if (source.documentTitle?.trim()) return source.documentTitle;
  const doc = documents.find((d) => d.id === source.documentId);
  if (doc?.title?.trim()) return doc.title;
  if (source.documentId) return `Doc ${source.documentId.slice(0, 8)}`;
  return 'Source';
}

export function sourceLink(source: Source): {
  pathname: string;
  hash?: string;
  state?: { chunkIndex: number };
} {
  const pathname = `/documents/${source.documentId}`;
  if (typeof source.chunkIndex !== 'number') {
    return { pathname };
  }
  return {
    pathname,
    hash: chunkAnchorId(source.chunkIndex),
    state: { chunkIndex: source.chunkIndex },
  };
}
