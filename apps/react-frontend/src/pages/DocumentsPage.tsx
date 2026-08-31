import { useDocuments } from '../context/DocumentsProvider';
import { DocumentsList } from '../components/DocumentsList';
import { PageSpinner } from '../components/PageSpinner';

export function DocumentsPage() {
  const { loading, documents } = useDocuments();

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-3xl font-semibold mb-2">Documents</h1>
      <p className="text-gray-400 mb-8">
        All uploaded files and their processing status.
      </p>
      {loading && documents.length === 0 ? <PageSpinner /> : <DocumentsList />}
    </div>
  );
}
