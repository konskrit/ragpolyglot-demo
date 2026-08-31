import { Link } from 'react-router-dom';
import {
  documentEmbeddingProgressPercent,
  formatDocumentProgressLabel,
  formatErrorReason,
  type DocumentSummary,
} from '@ragpolyglot-shared';
import { StatusBadge } from './StatusBadge';
import { DocumentActions } from './DocumentActions';

export function DocumentRow({ doc }: { doc: DocumentSummary }) {
  const progressLabel = formatDocumentProgressLabel(doc);
  const progressPct = documentEmbeddingProgressPercent(doc);

  return (
    <li className="flex items-center justify-between gap-3 bg-gray-900 rounded-lg px-4 py-3 border border-gray-800">
      <div className="flex-1 truncate mr-4 min-w-0">
        <Link
          to={`/documents/${doc.id}`}
          className="text-white hover:text-indigo-300 hover:underline"
        >
          {doc.title}
        </Link>
        {doc.createdAt && (
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
        <DocumentActions doc={doc} />
      </div>
    </li>
  );
}
