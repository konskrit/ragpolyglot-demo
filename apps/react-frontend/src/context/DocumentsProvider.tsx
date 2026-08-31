import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { deleteJson, getJson, postJson } from '../api/client';
import {
  isActiveDocumentStatus,
  type DocumentStatusUpdate,
  type DocumentSummary,
} from '@ragpolyglot-shared';
import {
  applyDocumentStatusUpdate,
  mapApiDocument,
  mapApiDocuments,
} from '../lib/documents';
import {
  onWebSocketConnect,
  subscribeDocument,
  useWebSocketEvent,
} from '../hooks/useWebSocket';

interface DocumentsContextValue {
  documents: DocumentSummary[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  remove: (id: string) => Promise<void>;
  retry: (id: string, ocrLang?: string) => Promise<void>;
  changeOcrLang: (id: string, ocrLang?: string) => Promise<void>;
  pause: (id: string) => Promise<void>;
  resume: (id: string) => Promise<void>;
  ensureSubscribed: (doc: Pick<DocumentSummary, 'id' | 'status'>) => void;
}

const DocumentsContext = createContext<DocumentsContextValue | null>(null);

export function DocumentsProvider({ children }: { children: ReactNode }) {
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const subscribedRef = useRef(new Set<string>());
  const documentsRef = useRef(documents);
  documentsRef.current = documents;

  const ensureSubscribed = useCallback(
    (doc: Pick<DocumentSummary, 'id' | 'status'>) => {
      if (!isActiveDocumentStatus(doc.status)) return;
      if (subscribedRef.current.has(doc.id)) return;
      subscribedRef.current.add(doc.id);
      subscribeDocument(doc.id);
    },
    [],
  );

  function subscribeActiveDocuments(docs: DocumentSummary[], force = false) {
    for (const doc of docs) {
      if (!isActiveDocumentStatus(doc.status)) continue;
      if (!force && subscribedRef.current.has(doc.id)) continue;
      subscribedRef.current.add(doc.id);
      subscribeDocument(doc.id);
    }
  }

  async function refresh() {
    try {
      setError(null);
      const data = await getJson<unknown>('/api/documents');
      const mapped = mapApiDocuments(data);
      setDocuments(mapped);
      subscribeActiveDocuments(mapped);
    } catch (e) {
      const message =
        e instanceof Error ? e.message : 'Failed to load documents';
      setError(message);
      console.error('Failed to load documents', e);
    } finally {
      setLoading(false);
    }
  }

  async function remove(id: string) {
    await deleteJson(`/api/documents/${encodeURIComponent(id)}`);
    subscribedRef.current.delete(id);
    setDocuments((prev) => prev.filter((d) => d.id !== id));
  }

  async function retry(id: string, ocrLang?: string) {
    try {
      const updated = await postJson<unknown>(
        `/api/documents/${encodeURIComponent(id)}/retry`,
        { ocrLang: ocrLang ?? null },
      );
      const mapped = mapApiDocument(updated);
      if (!mapped) {
        throw new Error('Invalid retry response');
      }

      setDocuments((prev) => prev.map((doc) => (doc.id === id ? mapped : doc)));
      ensureSubscribed(mapped);
    } catch (e) {
      await refresh();
      throw e;
    }
  }

  async function changeOcrLang(id: string, ocrLang?: string) {
    try {
      const updated = await postJson<unknown>(
        `/api/documents/${encodeURIComponent(id)}/ocr-lang`,
        { ocrLang: ocrLang ?? null },
      );
      const mapped = mapApiDocument(updated);
      if (!mapped) {
        throw new Error('Invalid OCR language response');
      }
      setDocuments((prev) => prev.map((doc) => (doc.id === id ? mapped : doc)));
      ensureSubscribed(mapped);
    } catch (e) {
      await refresh();
      throw e;
    }
  }

  async function pause(id: string) {
    try {
      await postJson(`/api/documents/${encodeURIComponent(id)}/pause`);
      setDocuments((prev) =>
        prev.map((doc) =>
          doc.id === id ? { ...doc, status: 'paused' as const } : doc,
        ),
      );
    } catch (e) {
      await refresh();
      throw e;
    }
  }

  async function resume(id: string) {
    try {
      const updated = await postJson<unknown>(
        `/api/documents/${encodeURIComponent(id)}/resume`,
      );
      const mapped = mapApiDocument(updated);
      if (!mapped) {
        throw new Error('Invalid resume response');
      }
      setDocuments((prev) => prev.map((doc) => (doc.id === id ? mapped : doc)));
      ensureSubscribed(mapped);
    } catch (e) {
      await refresh();
      throw e;
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(
    () =>
      onWebSocketConnect(() => {
        subscribeActiveDocuments(documentsRef.current, true);
      }),
    [],
  );

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (documentsRef.current.some((d) => isActiveDocumentStatus(d.status))) {
        void refresh();
      }
    }, 3000);
    return () => window.clearInterval(timer);
  }, []);

  useWebSocketEvent<DocumentStatusUpdate>(
    'document:status-update',
    ({
      documentId,
      status,
      errorReason,
      progressStage,
      progressDone,
      progressTotal,
    }) => {
      let missing = false;
      let needsRefresh = false;

      setDocuments((prev) => {
        const exists = prev.some((d) => d.id === documentId);
        if (!exists) {
          missing = true;
          return prev;
        }

        return prev.map((doc) => {
          if (doc.id !== documentId) return doc;
          const updated = applyDocumentStatusUpdate(doc, {
            status,
            errorReason,
            progressStage,
            progressDone,
            progressTotal,
          });
          if (!updated) return doc;
          if (updated.status === 'failed' && typeof errorReason !== 'string') {
            needsRefresh = true;
          }
          return updated;
        });
      });

      if (missing || needsRefresh) {
        void refresh();
      }
    },
  );

  return (
    <DocumentsContext.Provider
      value={{
        documents,
        loading,
        error,
        refresh,
        remove,
        retry,
        changeOcrLang,
        pause,
        resume,
        ensureSubscribed,
      }}
    >
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
