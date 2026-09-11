import { ApiError, getJson } from './client';

jest.mock('../config', () => ({
  API_BASE_URL: '',
}));

describe('getJson', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns parsed json on success', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify([{ id: '1' }]),
      json: async () => [{ id: '1' }],
    }) as unknown as typeof fetch;

    await expect(getJson('/api/documents')).resolves.toEqual([{ id: '1' }]);
  });

  it('throws ApiError with message from body', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => ({ message: 'Upstream unavailable' }),
      text: async () => '',
    }) as unknown as typeof fetch;

    await expect(getJson('/api/documents')).rejects.toEqual(
      expect.objectContaining({
        name: 'ApiError',
        status: 502,
        message: 'Upstream unavailable',
      } satisfies Partial<ApiError>),
    );
  });

  it('throws ApiError with error field from body', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        error: 'A document with this title already exists.',
      }),
      text: async () => '',
    }) as unknown as typeof fetch;

    await expect(getJson('/api/documents/1/rename')).rejects.toEqual(
      expect.objectContaining({
        name: 'ApiError',
        status: 409,
        message: 'A document with this title already exists.',
      } satisfies Partial<ApiError>),
    );
  });

  it('throws ApiError when body is a JSON string', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => 'A document with this title already exists.',
      text: async () => '',
    }) as unknown as typeof fetch;

    await expect(getJson('/api/documents/1/rename')).rejects.toEqual(
      expect.objectContaining({
        name: 'ApiError',
        status: 409,
        message: 'A document with this title already exists.',
      } satisfies Partial<ApiError>),
    );
  });

  it('returns undefined for empty 204-style bodies', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 204,
      text: async () => '',
      json: async () => null,
    }) as unknown as typeof fetch;

    await expect(getJson('/api/documents/1')).resolves.toBeUndefined();
  });
});
