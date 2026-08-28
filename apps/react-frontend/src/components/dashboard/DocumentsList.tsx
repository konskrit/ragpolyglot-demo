import { Link } from 'react-router-dom';
import { DocumentRow } from '../DocumentRow';
import type { UiDocument } from '../../lib/documents';

export function DocumentsList({
  documents,
  listError,
  onRemove,
  onRetry,
}: {
  documents: UiDocument[];
  listError: string | null;
  onRemove: (id: string) => Promise<void>;
  onRetry: (id: string) => Promise<void>;
}) {
  return (
    <>
      {listError && (
        <p className="text-sm text-red-400">
          Failed to load documents: {listError}
        </p>
      )}

      {documents.length > 0 ? (
        <section>
          <h2 className="text-lg font-medium mb-4 text-gray-300">
            Recent Documents
          </h2>
          <ul className="space-y-2">
            {documents.map((doc) => (
              <DocumentRow
                key={doc.id}
                doc={doc}
                onRemove={onRemove}
                onRetry={onRetry}
                showDate
              />
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
