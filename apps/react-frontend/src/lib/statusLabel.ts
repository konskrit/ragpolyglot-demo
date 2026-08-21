import { normalizeDocumentStatus } from '@ragpolyglot-shared';

const labels = {
  ready: 'Ready',
  processing: 'Processing',
  uploading: 'Uploading',
  failed: 'Failed',
} as const;

export function statusLabel(status: unknown): string {
  const normalized = normalizeDocumentStatus(status);
  return normalized ? labels[normalized] : String(status ?? 'unknown');
}
