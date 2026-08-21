import type { DocumentStatus, UploadState, ChatRole } from './types';

export const DOCUMENT_STATUSES = [
  'uploading',
  'processing',
  'ready',
  'failed',
] as const satisfies readonly DocumentStatus[];

export const UPLOAD_STATES = [
  'idle',
  'uploading',
  'success',
  'error',
] as const satisfies readonly UploadState[];

export const CHAT_ROLES = ['user', 'assistant'] as const satisfies readonly ChatRole[];

export function isDocumentStatus(value: unknown): value is DocumentStatus {
  return (
    typeof value === 'string' &&
    (DOCUMENT_STATUSES as readonly string[]).includes(value)
  );
}

export function normalizeDocumentStatus(
  status: unknown,
): DocumentStatus | null {
  const normalized = String(status ?? '').toLowerCase();
  return isDocumentStatus(normalized) ? normalized : null;
}
