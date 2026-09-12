import {
  clampChatTopK,
  clampTopK,
  normalizeChatMode,
  normalizeDocumentIds,
  toSources,
} from './rag.helpers';
import type { RagSearchHit } from '@ragpolyglot-shared';

describe('normalizeChatMode', () => {
  it('defaults to fast', () => {
    expect(normalizeChatMode(undefined)).toBe('fast');
    expect(normalizeChatMode('FAST')).toBe('fast');
  });

  it('accepts deep', () => {
    expect(normalizeChatMode('deep')).toBe('deep');
  });
});

describe('clampTopK', () => {
  it('clamps to 5-10', () => {
    expect(clampTopK(1)).toBe(5);
    expect(clampTopK(7)).toBe(7);
    expect(clampTopK(99)).toBe(10);
  });
});

describe('clampChatTopK', () => {
  it('clamps chat retrieve to 10-40', () => {
    expect(clampChatTopK(1)).toBe(10);
    expect(clampChatTopK(20)).toBe(20);
    expect(clampChatTopK(99)).toBe(40);
  });
});

describe('normalizeDocumentIds', () => {
  it('returns undefined for empty input', () => {
    expect(normalizeDocumentIds(undefined)).toBeUndefined();
    expect(normalizeDocumentIds([])).toBeUndefined();
  });

  it('dedupes, trims, lowercases, and sorts', () => {
    expect(normalizeDocumentIds([' B ', 'a', 'b', '', 'A'])).toEqual([
      'a',
      'b',
    ]);
  });
});

describe('toSources', () => {
  it('maps hits to Source shape', () => {
    const hits: RagSearchHit[] = [
      {
        documentId: 'doc-1',
        documentTitle: 'Ethics',
        chunkIndex: 0,
        content: 'chunk',
        similarity: 0.42,
      },
    ];
    expect(toSources(hits)).toEqual([
      {
        documentId: 'doc-1',
        documentTitle: 'Ethics',
        chunkContent: 'chunk',
        similarity: 0.42,
        chunkIndex: 0,
      },
    ]);
  });
});
