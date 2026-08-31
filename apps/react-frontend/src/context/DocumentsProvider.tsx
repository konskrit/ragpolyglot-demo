import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { deleteJson, getJson, postJson } from '../api/client';
import {
  isDocumentProgressStage,
  isActiveDocumentStatus,
  normalizeDocumentStatus,
  type DocumentStatusUpdate,
  type DocumentSummary,
} from '@ragpolyglot-shared';
import { mapApiDocument, mapApiDocuments } from '../lib/documents';
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
}

const DocumentsContext = createContext<DocumentsContextValue | null>(null);

export function DocumentsProvider({ children }: { children: ReactNode }) {
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const subscribedRef = useRef(new Set<string>());
  const documentsRef = useRef(documents);
  documentsRef.current = documents;

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
      subscribeDocument(id);
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
      subscribeActiveDocuments([mapped]);
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
      subscribeDocument(id);
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
      subscribeDocument(id);
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
    const hasActive = documents.some((d) => isActiveDocumentStatus(d.status));
    if (!hasActive) return;

    const timer = window.setInterval(() => {
      void refresh();
    }, 3000);

    return () => window.clearInterval(timer);
  }, [documents]);

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
      const normalized = normalizeDocumentStatus(status);
      if (!normalized) return;

      let missing = false;
      setDocuments((prev) => {
        const exists = prev.some((d) => d.id === documentId);
        if (!exists) {
          missing = true;
          return prev;
        }
        return prev.map((doc) => {
          if (doc.id !== documentId) return doc;

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

          if (normalized === 'failed') {
            return {
              ...doc,
              status: 'failed',
              errorReason:
                typeof errorReason === 'string' ? errorReason : doc.errorReason,
              progressStage: undefined,
              progressDone: undefined,
              progressTotal: undefined,
            };
          }

          if (normalized === 'paused') {
            return { ...doc, status: 'paused' };
          }

          return {
            ...doc,
            status: normalized,
            ...(normalized === 'processing' ? { errorReason: undefined } : {}),
            progressStage: isDocumentProgressStage(progressStage)
              ? progressStage
              : undefined,
            progressDone,
            progressTotal,
          };
        });
      });

      if (missing) {
        void refresh();
        return;
      }

      if (normalized === 'failed' && typeof errorReason !== 'string') {
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
