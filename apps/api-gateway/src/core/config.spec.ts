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

  it('defaults to 300 MB when unset', async () => {
    delete process.env.MAX_UPLOAD_BYTES;
    const { Config } = await import('./config');
    expect(Config.maxUploadBytes).toBe(300 * 1024 * 1024);
  });

  it('reads MAX_UPLOAD_BYTES from the environment', async () => {
    process.env.MAX_UPLOAD_BYTES = '20971520';
    const { Config } = await import('./config');
    expect(Config.maxUploadBytes).toBe(20971520);
  });

  it('falls back on invalid values', async () => {
    process.env.MAX_UPLOAD_BYTES = 'nope';
    const { Config } = await import('./config');
    expect(Config.maxUploadBytes).toBe(300 * 1024 * 1024);
  });
});

describe('ragCacheKey', () => {
  it('uses lowercase trimmed query hash, topK, and userId', async () => {
    const { ragCacheKey } = await import('./config');
    const hash = createHash('sha256')
      .update('hello world|topK=5|documents=0|scope=*|mode=fast|p=mode1')
      .digest('hex');
    expect(ragCacheKey('  Hello World  ', 'user-1', 5)).toBe(
      `rag:query:${hash}:user-1`,
    );
  });

  it('differs by documents version', async () => {
    const { ragCacheKey } = await import('./config');
    expect(ragCacheKey('q', 'u', 5, 1)).not.toBe(ragCacheKey('q', 'u', 5, 2));
  });

  it('defaults userId to anonymous', async () => {
    const { ragCacheKey } = await import('./config');
    expect(ragCacheKey('q')).toMatch(/^rag:query:[a-f0-9]{64}:anonymous$/);
  });

  it('differs by topK', async () => {
    const { ragCacheKey } = await import('./config');
    expect(ragCacheKey('q', 'u', 5)).not.toBe(ragCacheKey('q', 'u', 10));
  });

  it('differs by document scope', async () => {
    const { ragCacheKey } = await import('./config');
    expect(ragCacheKey('q', 'u', 5, 0, ['a'])).not.toBe(
      ragCacheKey('q', 'u', 5, 0),
    );
    expect(ragCacheKey('q', 'u', 5, 0, ['a'])).not.toBe(
      ragCacheKey('q', 'u', 5, 0, ['b']),
    );
  });
});
