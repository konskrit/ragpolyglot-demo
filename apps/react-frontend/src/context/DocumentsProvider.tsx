import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { deleteJson, getJson, postJson } from '../api/client';
import {
  mapApiDocument,
  mapApiDocuments,
  type UiDocument,
} from '../lib/documents';
import { subscribeDocument, useWebSocketEvent } from '../hooks/useWebSocket';
import { normalizeDocumentStatus } from '@ragpolyglot-shared';

interface StatusUpdatePayload {
  documentId: string;
  status: string;
  progressStage?: string;
  progressDone?: number;
  progressTotal?: number;
}

interface DocumentsContextValue {
  documents: UiDocument[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  remove: (id: string) => Promise<void>;
  retry: (id: string) => Promise<void>;
}

const DocumentsContext = createContext<DocumentsContextValue | null>(null);

const IN_FLIGHT_STATUSES = new Set(['uploading', 'processing']);

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
        if (IN_FLIGHT_STATUSES.has(doc.status)) {
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

  const retry = useCallback(
    async (id: string) => {
      try {
        const updated = await postJson<unknown>(
          `/api/documents/${encodeURIComponent(id)}/retry`,
        );
        const mapped = mapApiDocument(updated);
        if (!mapped) {
          throw new Error('Invalid retry response');
        }

        setDocuments((prev) =>
          prev.map((doc) => (doc.id === id ? mapped : doc)),
        );
        subscribeDocument(id);
      } catch (e) {
        void refresh();
        throw e;
      }
    },
    [refresh],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const inFlight = documents.some((d) => IN_FLIGHT_STATUSES.has(d.status));
    if (!inFlight) return;

    const timer = window.setInterval(() => {
      void refresh();
    }, 3000);

    return () => window.clearInterval(timer);
  }, [documents, refresh]);

  useWebSocketEvent<StatusUpdatePayload>(
    'document:status-update',
    ({ documentId, status, progressStage, progressDone, progressTotal }) => {
      const normalized = normalizeDocumentStatus(status);
      if (!normalized) return;

      if (normalized === 'failed') {
        void refresh();
        return;
      }

      let missing = false;
      setDocuments((prev) => {
        const exists = prev.some((d) => d.id === documentId);
        if (!exists) {
          missing = true;
          return prev;
        }
        return prev.map((doc) => {
          if (doc.id !== documentId) return doc;

          // Ignore late progress after a terminal status update.
          if (
            normalized === 'processing' &&
            (doc.status === 'ready' || doc.status === 'failed')
          ) {
            return doc;
          }

          if (normalized === 'ready') {
            return {
              ...doc,
              status: 'ready',
              errorReason: undefined,
              progressStage: undefined,
              progressDone: undefined,
              progressTotal: undefined,
            };
          }

          return {
            ...doc,
            status: normalized,
            progressStage,
            progressDone,
            progressTotal,
          };
        });
      });

      if (missing) {
        void refresh();
      }
    },
  );

  const value = useMemo<DocumentsContextValue>(
    () => ({
      documents,
      loading,
      error,
      refresh,
      remove,
      retry,
    }),
    [documents, loading, error, refresh, remove, retry],
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
