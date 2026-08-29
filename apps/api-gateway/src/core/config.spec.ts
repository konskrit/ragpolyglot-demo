import { createHash } from 'crypto';

describe('Config.maxUploadBytes', () => {
  const original = process.env.MAX_UPLOAD_BYTES;

  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env.MAX_UPLOAD_BYTES;
    } else {
      process.env.MAX_UPLOAD_BYTES = original;
    }
    jest.resetModules();
  });

  it('defaults to 20 MB when unset', async () => {
    delete process.env.MAX_UPLOAD_BYTES;
    const { Config } = await import('./config');
    expect(Config.maxUploadBytes).toBe(20 * 1024 * 1024);
  });

  it('reads MAX_UPLOAD_BYTES from the environment', async () => {
    process.env.MAX_UPLOAD_BYTES = '314572800';
    const { Config } = await import('./config');
    expect(Config.maxUploadBytes).toBe(314572800);
  });

  it('falls back on invalid values', async () => {
    process.env.MAX_UPLOAD_BYTES = 'nope';
    const { Config } = await import('./config');
    expect(Config.maxUploadBytes).toBe(20 * 1024 * 1024);
  });
});

describe('ragCacheKey', () => {
  it('uses lowercase trimmed query hash, topK, and userId', async () => {
    const { ragCacheKey } = await import('./config');
    const hash = createHash('sha256')
      .update('hello world|topK=5')
      .digest('hex');
    expect(ragCacheKey('  Hello World  ', 'user-1', 5)).toBe(
      `rag:query:${hash}:user-1`,
    );
  });

  it('defaults userId to anonymous', async () => {
    const { ragCacheKey } = await import('./config');
    expect(ragCacheKey('q')).toMatch(/^rag:query:[a-f0-9]{64}:anonymous$/);
  });

  it('differs by topK', async () => {
    const { ragCacheKey } = await import('./config');
    expect(ragCacheKey('q', 'u', 5)).not.toBe(ragCacheKey('q', 'u', 10));
  });
});
