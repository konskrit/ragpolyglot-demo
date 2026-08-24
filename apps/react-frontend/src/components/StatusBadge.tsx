import { normalizeDocumentStatus } from '@ragpolyglot-shared';
import type { DocumentStatus } from '@ragpolyglot-shared';

const labels: Record<DocumentStatus, string> = {
  ready: 'Ready',
  processing: 'Processing',
  uploading: 'Uploading',
  failed: 'Failed',
};

const styles: Record<DocumentStatus, string> = {
  ready: 'bg-green-500/20 text-green-400',
  processing: 'bg-yellow-500/20 text-yellow-400 animate-pulse',
  uploading: 'bg-blue-500/20 text-blue-400 animate-pulse',
  failed: 'bg-red-500/20 text-red-400',
};

export function StatusBadge({ status }: { status: DocumentStatus | string }) {
  const normalized = normalizeDocumentStatus(status);

  if (!normalized) {
    return (
      <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-500/20 text-gray-400">
        {String(status ?? 'unknown')}
      </span>
    );
  }

  return (
    <span
      className={`px-2 py-1 rounded-full text-xs font-medium ${styles[normalized]}`}
    >
      {labels[normalized]}
    </span>
  );
}
