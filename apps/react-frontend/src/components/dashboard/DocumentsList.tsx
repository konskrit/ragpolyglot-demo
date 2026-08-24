import { useState } from 'react';
import { Link } from 'react-router-dom';
import { StatusBadge } from '../StatusBadge';
import type { UiDocument } from '../../lib/documents';

export function DocumentsList({
  documents,
  listError,
  onRemove,
}: {
  documents: UiDocument[];
  listError: string | null;
  onRemove: (id: string) => Promise<void>;
}) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const onDelete = async (id: string) => {
    if (deletingId) return;
    setDeletingId(id);
    setDeleteError(null);
    try {
      await onRemove(id);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <>
      {listError && (
        <p className="text-sm text-red-400">
          Failed to load documents: {listError}
        </p>
      )}
      {deleteError && <p className="text-sm text-red-400">{deleteError}</p>}

      {documents.length > 0 ? (
        <section>
          <h2 className="text-lg font-medium mb-4 text-gray-300">
            Recent Documents
          </h2>
          <ul className="space-y-2">
            {documents.map((doc) => (
              <li
                key={doc.id}
                className="flex items-center justify-between bg-gray-900 rounded-lg px-4 py-3 border border-gray-800 gap-3"
              >
                <div className="flex-1 truncate mr-4">
                  <span className="text-white">{doc.title}</span>
                  {doc.createdAt && (
                    <span className="ml-2 text-xs text-gray-500">
                      {new Date(doc.createdAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <StatusBadge status={doc.status} />
                  <button
                    type="button"
                    onClick={() => void onDelete(doc.id)}
                    disabled={deletingId === doc.id}
                    className="text-xs text-gray-500 hover:text-red-400 disabled:opacity-40"
                    aria-label={`Delete ${doc.title}`}
                  >
                    {deletingId === doc.id ? '…' : 'Delete'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <div className="text-center py-12 bg-gray-900 rounded-xl border border-gray-800">
          <p className="text-gray-400 mb-4">No documents yet</p>
          <Link
            to="/upload"
            className="inline-block px-6 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-white font-medium transition"
          >
            Upload your first document
          </Link>
        </div>
      )}
    </>
  );
}
