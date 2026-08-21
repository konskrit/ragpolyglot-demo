import { createHash } from 'crypto';
import { ragCacheKey } from './config';

describe('ragCacheKey', () => {
  it('uses lowercase trimmed query hash, topK, and userId', () => {
    const hash = createHash('sha256')
      .update('hello world|topK=5')
      .digest('hex');
    expect(ragCacheKey('  Hello World  ', 'user-1', 5)).toBe(
      `rag:query:${hash}:user-1`,
    );
  });

  it('defaults userId to anonymous', () => {
    expect(ragCacheKey('q')).toMatch(/^rag:query:[a-f0-9]{64}:anonymous$/);
  });

  it('differs by topK', () => {
    expect(ragCacheKey('q', 'u', 5)).not.toBe(ragCacheKey('q', 'u', 10));
  });
});
