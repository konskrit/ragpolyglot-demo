import { useState } from 'react';
import { StatusBadge } from './StatusBadge';
import type { UiDocument } from '../lib/documents';

export function DocumentRow({
  doc,
  onRemove,
  onRetry,
  showDate = false,
}: {
  doc: UiDocument;
  onRemove: (id: string) => Promise<void>;
  onRetry: (id: string) => Promise<void>;
  showDate?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const runAction = async (
    action: (id: string) => Promise<void>,
    fallbackMessage: string,
  ) => {
    if (pending) return;
    setPending(true);
    setActionError(null);
    try {
      await action(doc.id);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : fallbackMessage);
    } finally {
      setPending(false);
    }
  };

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
              {doc.errorReason.replace(/_/g, ' ')}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <StatusBadge status={doc.status} />
          {doc.status === 'failed' && (
            <button
              type="button"
              onClick={() => void runAction(onRetry, 'Retry failed')}
              disabled={pending}
              className="text-xs text-indigo-400 hover:text-indigo-300 disabled:opacity-40"
              aria-label={`Retry ${doc.title}`}
            >
              {pending ? '…' : 'Retry'}
            </button>
          )}
          <button
            type="button"
            onClick={() => void runAction(onRemove, 'Delete failed')}
            disabled={pending}
            className="text-xs text-gray-500 hover:text-red-400 disabled:opacity-40"
            aria-label={`Delete ${doc.title}`}
          >
            {pending ? '…' : 'Delete'}
          </button>
        </div>
      </div>
      {actionError && <p className="text-xs text-red-400">{actionError}</p>}
    </li>
  );
}
