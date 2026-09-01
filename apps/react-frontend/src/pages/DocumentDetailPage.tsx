import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  formatDocumentProgressLabel,
  type DocumentChunk,
  type DocumentSummary,
} from '@ragpolyglot-shared';
import { DocumentActions } from '../components/DocumentActions';
import { StatusBadge } from '../components/StatusBadge';
import { PageSpinner } from '../components/PageSpinner';
import { useDocuments } from '../context/DocumentsProvider';
import { loadDocument, loadDocumentChunks } from '../lib/documents';
import { chunkAnchorId, parseChunkNavigationTarget } from '../lib/chunkAnchor';

export function DocumentDetailPage() {
  const { id } = useParams<{ id: string }>();
  if (!id) {
    return <p className="text-red-400">Missing document id.</p>;
  }
  return <DocumentDetail key={id} id={id} />;
}

function DocumentDetail({ id }: { id: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { documents, loading: listLoading } = useDocuments();
  const listDoc = documents.find((d) => d.id === id);

  const [fetched, setFetched] = useState<DocumentSummary | null>(null);
  const [chunks, setChunks] = useState<DocumentChunk[]>([]);
  const [loading, setLoading] = useState(true);
  const [chunksLoading, setChunksLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chunksError, setChunksError] = useState<string | null>(null);
  const scrolledChunkRef = useRef<number | null>(null);

  const targetChunkIndex = useMemo(
    () => parseChunkNavigationTarget(location.hash, location.state),
    [location.hash, location.state],
  );

  const doc = listDoc ?? fetched;
  const inList = listDoc !== undefined;

  useEffect(() => {
    if (listLoading) return;
    if (inList) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void loadDocument(id)
      .then((result) => {
        if (cancelled) return;
        if (!result) setError('Document not found');
        else setFetched(result);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load document');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id, inList, listLoading]);

  useEffect(() => {
    if (doc?.status !== 'ready') {
      setChunks([]);
      return;
    }

    let cancelled = false;
    setChunksLoading(true);
    setChunksError(null);

    void loadDocumentChunks(id)
      .then((data) => {
        if (!cancelled) setChunks(data);
      })
      .catch((e) => {
        if (!cancelled) {
          setChunksError(
            e instanceof Error ? e.message : 'Failed to load document chunks',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setChunksLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id, doc?.status]);

  useEffect(() => {
    scrolledChunkRef.current = null;
  }, [id, targetChunkIndex]);

  const scrollToChunk = (chunkIndex: number, el: HTMLElement) => {
    if (scrolledChunkRef.current === chunkIndex) return;
    scrolledChunkRef.current = chunkIndex;
    requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  };

  if (loading && !doc) {
    return <PageSpinner />;
  }

  if (error && !doc) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <Link
          to="/documents"
          className="text-sm text-indigo-400 hover:text-indigo-300"
        >
          ← Documents
        </Link>
        <p className="text-red-400">{error}</p>
      </div>
    );
  }

  if (!doc) {
    return null;
  }

  const progressLabel = formatDocumentProgressLabel(doc);

  return (
    <div className="max-w-4xl mx-auto space-y-6 min-w-0">
      <Link
        to="/documents"
        className="text-sm text-indigo-400 hover:text-indigo-300"
      >
        ← Documents
      </Link>

      <header className="space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 min-w-0">
            <h1 className="text-2xl font-semibold text-white">{doc.title}</h1>
            <StatusBadge status={doc.status} />
          </div>
          <DocumentActions doc={doc} onDeleted={() => navigate('/documents')} />
        </div>
        {doc.createdAt && (
          <p className="text-sm text-gray-500">
            Uploaded {new Date(doc.createdAt).toLocaleString()}
          </p>
        )}
        {progressLabel && (
          <p className="text-sm text-gray-400">{progressLabel}</p>
        )}
      </header>

      {doc.status !== 'ready' ? (
        <p className="text-gray-400 text-sm">
          Extracted text is available after processing completes.
        </p>
      ) : chunksLoading ? (
        <PageSpinner />
      ) : chunksError ? (
        <p className="text-sm text-red-400">{chunksError}</p>
      ) : chunks.length === 0 ? (
        <p className="text-gray-400 text-sm">
          No chunks stored for this document.
        </p>
      ) : (
        <section className="space-y-3">
          <p className="text-sm text-gray-400">
            {chunks.length} chunk{chunks.length === 1 ? '' : 's'} (indexed text
            used for search)
          </p>
          <ul className="space-y-3 min-w-0">
            {chunks.map((chunk) => (
              <li
                key={chunk.chunkIndex}
                id={chunkAnchorId(chunk.chunkIndex)}
                ref={(el) => {
                  if (
                    el &&
                    targetChunkIndex !== null &&
                    chunk.chunkIndex === targetChunkIndex
                  ) {
                    scrollToChunk(chunk.chunkIndex, el);
                  }
                }}
                className={`rounded-lg border px-4 py-3 min-w-0 max-w-full scroll-mt-24 ${
                  targetChunkIndex === chunk.chunkIndex
                    ? 'border-indigo-500 bg-indigo-950/30 ring-1 ring-indigo-500/40'
                    : 'border-gray-800 bg-gray-900'
                }`}
              >
                <p className="text-xs font-medium text-gray-500 mb-2">
                  Chunk {chunk.chunkIndex + 1}
                </p>
                <div className="min-w-0 max-w-full overflow-x-auto">
                  <p className="text-sm text-gray-200 whitespace-pre-wrap break-words [overflow-wrap:anywhere] leading-relaxed">
                    {chunk.content}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
