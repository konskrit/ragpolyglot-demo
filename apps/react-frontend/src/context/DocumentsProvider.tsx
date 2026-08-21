import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { deleteJson, getJson } from '../api/client';
import { mapApiDocuments, type UiDocument } from '../lib/documents';
import { subscribeDocument, useWebSocketEvent } from '../hooks/useWebSocket';
import { normalizeDocumentStatus } from '@ragpolyglot-shared';

interface StatusUpdatePayload {
  documentId: string;
  status: string;
}

interface DocumentsContextValue {
  documents: UiDocument[];
  loading: boolean;
  error: string | null;
  hasReadyDocuments: boolean;
  refresh: () => Promise<void>;
  remove: (id: string) => Promise<void>;
}

const DocumentsContext = createContext<DocumentsContextValue | null>(null);

export function DocumentsProvider({ children }: { children: ReactNode }) {
  const [documents, setDocuments] = useState<UiDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const data = await getJson<unknown>('/api/documents');
      const mapped = mapApiDocuments(data);
      setDocuments(mapped);

      for (const doc of mapped) {
        if (doc.status === 'uploading' || doc.status === 'processing') {
          subscribeDocument(doc.id);
        }
      }
    } catch (e) {
      const message =
        e instanceof Error ? e.message : 'Failed to load documents';
      setError(message);
      console.error('Failed to load documents', e);
    } finally {
      setLoading(false);
    }
  }, []);

  const remove = useCallback(async (id: string) => {
    await deleteJson(`/api/documents/${encodeURIComponent(id)}`);
    setDocuments((prev) => prev.filter((d) => d.id !== id));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const inFlight = documents.some(
      (d) => d.status === 'uploading' || d.status === 'processing',
    );
    if (!inFlight) return;

    const timer = window.setInterval(() => {
      void refresh();
    }, 3000);

    return () => window.clearInterval(timer);
  }, [documents, refresh]);

  useWebSocketEvent<StatusUpdatePayload>(
    'document:status-update',
    ({ documentId, status }) => {
      const normalized = normalizeDocumentStatus(status);
      if (!normalized) return;

      setDocuments((prev) => {
        const exists = prev.some((d) => d.id === documentId);
        if (!exists) {
          void refresh();
          return prev;
        }
        return prev.map((doc) =>
          doc.id === documentId ? { ...doc, status: normalized } : doc,
        );
      });
    },
  );

  const value = useMemo<DocumentsContextValue>(
    () => ({
      documents,
      loading,
      error,
      hasReadyDocuments: documents.some((d) => d.status === 'ready'),
      refresh,
      remove,
    }),
    [documents, loading, error, refresh, remove],
  );

  return (
    <DocumentsContext.Provider value={value}>
      {children}
    </DocumentsContext.Provider>
  );
}

export function useDocuments(): DocumentsContextValue {
  const ctx = useContext(DocumentsContext);
  if (!ctx) {
    throw new Error('useDocuments must be used within DocumentsProvider');
  }
  return ctx;
}
