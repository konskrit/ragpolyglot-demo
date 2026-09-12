import type { RagSearchHit, Source } from '@ragpolyglot-shared';

export type ChatMode = 'fast' | 'deep';

export function normalizeChatMode(mode?: string | null): ChatMode {
  return mode?.trim().toLowerCase() === 'deep' ? 'deep' : 'fast';
}

export function clampTopK(topK: number): number {
  if (topK < 5) return 5;
  if (topK > 10) return 10;
  return topK;
}

export function clampChatTopK(topK: number): number {
  if (topK < 10) return 10;
  if (topK > 40) return 40;
  return topK;
}

/** Empty/omitted → undefined (all docs). Sorted unique lowercase ids. */
export function normalizeDocumentIds(
  ids?: readonly string[] | null,
): string[] | undefined {
  if (!ids?.length) return undefined;
  const out = [
    ...new Set(ids.map((id) => id.trim().toLowerCase()).filter(Boolean)),
  ].sort();
  return out.length > 0 ? out : undefined;
}

export function toSources(hits: RagSearchHit[]): Source[] {
  return hits.map((h) => ({
    documentId: h.documentId,
    documentTitle: h.documentTitle?.trim() || '',
    chunkContent: h.content,
    similarity: h.similarity,
    chunkIndex: h.chunkIndex,
  }));
}
