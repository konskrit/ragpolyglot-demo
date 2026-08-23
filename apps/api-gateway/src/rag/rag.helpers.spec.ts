import { clampTopK, toSources } from './rag.helpers';
import type { RagSearchHit } from '@ragpolyglot-shared';

describe('clampTopK', () => {
  it('clamps to AGENTS bounds 5-10', () => {
    expect(clampTopK(1)).toBe(5);
    expect(clampTopK(7)).toBe(7);
    expect(clampTopK(99)).toBe(10);
  });
});

describe('toSources', () => {
  it('maps hits to Source shape', () => {
    const hits: RagSearchHit[] = [
      {
        documentId: 'doc-1',
        chunkIndex: 0,
        content: 'chunk',
        similarity: 0.42,
      },
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
