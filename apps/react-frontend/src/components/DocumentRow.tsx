import { useState } from 'react';
import {
  documentEmbeddingProgressPercent,
  formatDocumentProgressLabel,
  formatErrorReason,
  type DocumentSummary,
} from '@ragpolyglot-shared';
import { StatusBadge } from './StatusBadge';
import { Button } from './Button';
import { useDocuments } from '../context/DocumentsProvider';

export function DocumentRow({
  doc,
  showDate = false,
}: {
  doc: DocumentSummary;
  showDate?: boolean;
}) {
  const { remove, retry } = useDocuments();
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const runAction = async (
    action: () => Promise<void>,
    fallbackMessage: string,
  ) => {
    if (pending) return;
    setPending(true);
    setActionError(null);
    try {
      await action();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : fallbackMessage);
    } finally {
      setPending(false);
    }
  };

  const progressLabel = formatDocumentProgressLabel(doc);
  const progressPct = documentEmbeddingProgressPercent(doc);

  return (
    <li className="flex flex-col bg-gray-900 rounded-lg px-4 py-3 border border-gray-800 gap-1">
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 truncate mr-4 min-w-0">
          <span className="text-white">{doc.title}</span>
          {showDate && doc.createdAt && (
            <span className="ml-2 text-xs text-gray-500">
              {new Date(doc.createdAt).toLocaleDateString()}
            </span>
          )}
          {doc.status === 'failed' && doc.errorReason && (
            <p className="text-xs text-red-400/80 mt-0.5 truncate">
              {formatErrorReason(doc.errorReason)}
            </p>
          )}
          {progressLabel && (
            <p className="text-xs text-gray-400 mt-0.5">{progressLabel}</p>
          )}
          {progressPct !== null && (
            <div className="mt-1.5 h-1 w-full max-w-xs rounded-full bg-gray-800 overflow-hidden">
              <div
                className="h-full bg-yellow-500/70 transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <StatusBadge status={doc.status} />
          {doc.status === 'failed' && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                void runAction(() => retry(doc.id), 'Retry failed')
              }
              disabled={pending}
              aria-label={`Retry ${doc.title}`}
            >
              {pending ? '…' : 'Retry'}
            </Button>
          )}
          {(doc.status === 'ready' || doc.status === 'failed') && (
            <Button
              variant="danger"
              size="sm"
              onClick={() =>
                void runAction(() => remove(doc.id), 'Delete failed')
              }
              disabled={pending}
              aria-label={`Delete ${doc.title}`}
            >
              {pending ? '…' : 'Delete'}
            </Button>
          )}
        </div>
      </div>
      {actionError && <p className="text-xs text-red-400">{actionError}</p>}
    </li>
  );
}
