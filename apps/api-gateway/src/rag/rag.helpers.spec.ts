import { buildAnswer, clampTopK, toSources } from './rag.helpers';
import type { RagSearchHit } from '@ragpolyglot-shared';

describe('clampTopK', () => {
  it('clamps to AGENTS bounds 5-10', () => {
    expect(clampTopK(1)).toBe(5);
    expect(clampTopK(7)).toBe(7);
    expect(clampTopK(99)).toBe(10);
  });
});

describe('buildAnswer', () => {
  it('returns fallback when no hits', () => {
    expect(buildAnswer([])).toBe("I don't know based on the documents.");
  });

  it('joins trimmed chunk content', () => {
    const hits: RagSearchHit[] = [
      { documentId: 'a', chunkIndex: 0, content: '  one  ', similarity: 0.9 },
      { documentId: 'b', chunkIndex: 1, content: 'two', similarity: 0.8 },
    ];
    expect(buildAnswer(hits)).toBe('one\n\ntwo');
  });
});

describe('toSources', () => {
  it('maps hits to Source shape', () => {
    const hits: RagSearchHit[] = [
      { documentId: 'doc-1', chunkIndex: 0, content: 'chunk', similarity: 0.42 },
    ];
    expect(toSources(hits)).toEqual([
      {
        documentId: 'doc-1',
        documentTitle: '',
        chunkContent: 'chunk',
        similarity: 0.42,
      },
    ]);
  });
});
