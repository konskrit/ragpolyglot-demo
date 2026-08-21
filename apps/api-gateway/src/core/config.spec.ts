import { createHash } from 'crypto';
import { ragCacheKey } from './config';

describe('ragCacheKey', () => {
  it('uses lowercase trimmed query hash and userId', () => {
    const hash = createHash('sha256').update('hello world').digest('hex');
    expect(ragCacheKey('  Hello World  ', 'user-1')).toBe(
      `rag:query:${hash}:user-1`,
    );
  });

  it('defaults userId to anonymous', () => {
    expect(ragCacheKey('q')).toMatch(/^rag:query:[a-f0-9]{64}:anonymous$/);
  });
});
