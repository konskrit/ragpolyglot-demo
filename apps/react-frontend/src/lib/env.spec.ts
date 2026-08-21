import { resolveApiBaseUrl, resolveWsUrl } from './env';

describe('resolveApiBaseUrl', () => {
  it('treats blank env as unset', () => {
    expect(resolveApiBaseUrl('')).toBe('');
    expect(resolveApiBaseUrl('   ')).toBe('');
    expect(resolveApiBaseUrl(undefined)).toBe('');
  });

  it('keeps explicit api base', () => {
    expect(resolveApiBaseUrl('http://localhost:3000')).toBe(
      'http://localhost:3000',
    );
  });
});

describe('resolveWsUrl', () => {
  it('falls back when env is blank', () => {
    expect(resolveWsUrl('', 'http://localhost:4200')).toBe(
      'http://localhost:4200/ws',
    );
    expect(resolveWsUrl(undefined, 'http://localhost:4200')).toBe(
      'http://localhost:4200/ws',
    );
  });

  it('uses explicit ws url', () => {
    expect(resolveWsUrl('http://localhost:3000/ws')).toBe(
      'http://localhost:3000/ws',
    );
  });
});
