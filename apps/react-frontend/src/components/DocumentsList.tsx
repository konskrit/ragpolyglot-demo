import { DocumentRow } from './DocumentRow';
import { ButtonLink } from './Button';
import { useDocuments } from '../context/DocumentsProvider';

export function DocumentsList({
  limit,
  title,
  showViewAll = false,
}: {
  limit?: number;
  title?: string;
  showViewAll?: boolean;
}) {
  const { documents, error } = useDocuments();
  const visible = limit ? documents.slice(0, limit) : documents;
  const showViewAllLink =
    showViewAll && limit != null && documents.length > limit;
  const showHeader = title != null || showViewAllLink;

  return (
    <>
      {error && (
        <p className="text-sm text-red-400">
          Failed to load documents: {error}
        </p>
      )}

      {documents.length > 0 ? (
        <section>
          {showHeader && (
            <div
              className={`flex items-center gap-3 mb-4 ${title ? 'justify-between' : 'justify-end'}`}
            >
              {title && (
                <h2 className="text-lg font-medium text-gray-300">{title}</h2>
              )}
              {showViewAllLink && (
                <ButtonLink to="/documents" variant="secondary" size="sm">
                  View all ({documents.length})
                </ButtonLink>
              )}
            </div>
          )}
          <ul className="space-y-2">
            {visible.map((doc) => (
              <DocumentRow key={doc.id} doc={doc} />
            ))}
          </ul>
        </section>
      ) : (
        !error && (
          <div className="text-center py-12 bg-gray-900 rounded-xl border border-gray-800">
            <p className="text-gray-400 mb-4">No documents yet</p>
            <ButtonLink to="/upload">Upload your first document</ButtonLink>
          </div>
        )
      )}
    </>
  );
}
