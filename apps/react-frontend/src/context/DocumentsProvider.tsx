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
import { subscribeDocument, useWebSocketEvent } from '../hooks/useWebSocket';

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

  function watchDocument(id: string) {
    if (subscribedRef.current.has(id)) return;
    subscribedRef.current.add(id);
    subscribeDocument(id);
  }

  function subscribeActiveDocuments(docs: DocumentSummary[]) {
    for (const doc of docs) {
      if (!isActiveDocumentStatus(doc.status)) continue;
      watchDocument(doc.id);
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

  async function applyMappedUpdate(
    id: string,
    request: Promise<unknown>,
    invalidMessage: string,
  ): Promise<DocumentSummary> {
    try {
      const mapped = mapApiDocument(await request);
      if (!mapped) {
        throw new Error(invalidMessage);
      }
      setDocuments((prev) => prev.map((doc) => (doc.id === id ? mapped : doc)));
      return mapped;
    } catch (e) {
      await refresh();
      throw e;
    }
  }

  async function retry(id: string, ocrLang?: string) {
    await applyMappedUpdate(
      id,
      postJson(`/api/documents/${encodeURIComponent(id)}/retry`, {
        ocrLang: ocrLang ?? null,
      }),
      'Invalid retry response',
    );
    subscribeDocument(id);
  }

  async function changeOcrLang(id: string, ocrLang?: string) {
    const mapped = await applyMappedUpdate(
      id,
      postJson(`/api/documents/${encodeURIComponent(id)}/ocr-lang`, {
        ocrLang: ocrLang ?? null,
      }),
      'Invalid OCR language response',
    );
    subscribeActiveDocuments([mapped]);
  }

  async function pause(id: string) {
    try {
      await postJson(`/api/documents/${encodeURIComponent(id)}/pause`);
      subscribeDocument(id);
    } catch (e) {
      await refresh();
      throw e;
    }
  }

  async function resume(id: string) {
    await applyMappedUpdate(
      id,
      postJson(`/api/documents/${encodeURIComponent(id)}/resume`),
      'Invalid resume response',
    );
    subscribeDocument(id);
  }

  useEffect(() => {
    void refresh();
  }, []);

  const hasActive = documents.some((d) => isActiveDocumentStatus(d.status));

  useEffect(() => {
    if (!hasActive) return;

    const timer = window.setInterval(() => {
      void refresh();
    }, 3000);

    return () => window.clearInterval(timer);
  }, [hasActive]);

  useWebSocketEvent<DocumentStatusUpdate>(
    'document:status-update',
    ({ documentId, status, progressStage, progressDone, progressTotal }) => {
      const normalized = normalizeDocumentStatus(status);
      if (!normalized) return;

      if (
        normalized === 'failed' ||
        normalized === 'paused' ||
        normalized === 'ready'
      ) {
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
          return {
            ...doc,
            status: normalized,
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
