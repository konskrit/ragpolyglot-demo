import { API_BASE_URL } from '../config';

const DEFAULT_TIMEOUT_MS = 15_000;

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function extractErrorMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== 'object') return fallback;
  const record = body as Record<string, unknown>;
  const message = record.message ?? record.error ?? record.detail;
  if (typeof message === 'string' && message.trim()) return message;
  if (Array.isArray(message) && message.length > 0) {
    return message.map(String).join(', ');
  }
  return fallback;
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = `Server responded with ${res.status}`;
    const body = await res.json().catch(() => null);
    detail = extractErrorMessage(body, detail);
    throw new ApiError(res.status, detail);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const text = await res.text();
  if (!text) {
    return undefined as T;
  }

  return JSON.parse(text) as T;
}

async function fetchWithTimeout(
  input: string,
  init?: RequestInit,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiError(408, 'Request timed out');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function getJson<T>(path: string): Promise<T> {
  const res = await fetchWithTimeout(`${API_BASE_URL}${path}`);
  return handleResponse<T>(res);
}

export async function postFormData<T>(
  path: string,
  formData: FormData,
): Promise<T> {
  const res = await fetchWithTimeout(`${API_BASE_URL}${path}`, {
    method: 'POST',
    body: formData,
  });
  return handleResponse<T>(res);
}

export async function postJson<T>(path: string): Promise<T> {
  const res = await fetchWithTimeout(`${API_BASE_URL}${path}`, {
    method: 'POST',
  });
  return handleResponse<T>(res);
}

export async function deleteJson<T = void>(path: string): Promise<T> {
  const res = await fetchWithTimeout(`${API_BASE_URL}${path}`, {
    method: 'DELETE',
  });
  return handleResponse<T>(res);
}
