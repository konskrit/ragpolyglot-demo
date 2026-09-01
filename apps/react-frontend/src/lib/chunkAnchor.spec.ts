import {
  chunkAnchorId,
  parseChunkAnchorHash,
  parseChunkNavigationTarget,
} from './chunkAnchor';

describe('chunkAnchor', () => {
  it('maps 0-based index to 1-based anchor id', () => {
    expect(chunkAnchorId(44)).toBe('chunk-45');
  });

  it('parses 1-based hash back to 0-based index', () => {
    expect(parseChunkAnchorHash('#chunk-45')).toBe(44);
    expect(parseChunkAnchorHash('')).toBeNull();
    expect(parseChunkAnchorHash('#chunk-0')).toBeNull();
  });

  it('prefers hash over router state', () => {
    expect(parseChunkNavigationTarget('#chunk-45', { chunkIndex: 0 })).toBe(44);
    expect(parseChunkNavigationTarget('', { chunkIndex: 3 })).toBe(3);
  });
});
