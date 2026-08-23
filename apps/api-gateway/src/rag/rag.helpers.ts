import type { RagSearchHit, Source } from '@ragpolyglot-shared';

export function clampTopK(topK: number): number {
  if (topK < 5) return 5;
  if (topK > 10) return 10;
  return topK;
}

export function toSources(hits: RagSearchHit[]): Source[] {
  return hits.map((h) => ({
    documentId: h.documentId,
    documentTitle: '',
    chunkContent: h.content,
    similarity: h.similarity,
  }));
}
