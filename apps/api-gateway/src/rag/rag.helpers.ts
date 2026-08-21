import type { RagSearchHit, Source } from '@ragpolyglot-shared';

export function clampTopK(topK: number): number {
  if (topK < 5) return 5;
  if (topK > 10) return 10;
  return topK;
}

export function buildAnswer(hits: RagSearchHit[]): string {
  if (hits.length === 0) {
    return "I don't know based on the documents.";
  }

  return hits.map((h) => h.content.trim()).filter(Boolean).join('\n\n');
}

export function toSources(hits: RagSearchHit[]): Source[] {
  return hits.map((h) => ({
    documentId: h.documentId,
    documentTitle: '',
    chunkContent: h.content,
    similarity: h.similarity,
  }));
}
