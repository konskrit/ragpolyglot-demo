import {
  createContext,
  useContext,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useLocation } from 'react-router-dom';
import { deleteJson, getJson, postJson } from '../api/client';
import {
  isDocumentProgressStage,
  isActiveDocumentStatus,
  isActiveSummarizeStatus,
  isSummarizeStatus,
  normalizeDocumentStatus,
  type DocumentStatusUpdate,
  type DocumentSummary,
} from '@ragpolyglot-shared';
import {
  mapApiDocument,
  mapApiDocuments,
  pauseSummarize as pauseSummarizeRequest,
  resumeSummarize as resumeSummarizeRequest,
  startSummarize as startSummarizeRequest,
} from '../lib/documents';
import {
  subscribeDocument,
  unsubscribeDocument,
  useWebSocketEvent,
  useWebSocketStatus,
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
  rename: (id: string, title: string) => Promise<DocumentSummary>;
  startSummarize: (id: string) => Promise<DocumentSummary>;
  pauseSummarize: (id: string) => Promise<DocumentSummary>;
  resumeSummarize: (id: string) => Promise<DocumentSummary>;
  connected: boolean;
}

const DocumentsContext = createContext<DocumentsContextValue | null>(null);

async function fetchDocuments(): Promise<DocumentSummary[]> {
  const data = await getJson<unknown>('/api/documents');
  return mapApiDocuments(data);
}

function subscribeActiveDocuments(
  docs: DocumentSummary[],
  subscribed: Set<string>,
): void {
  for (const doc of docs) {
    if (
      !isActiveDocumentStatus(doc.status) &&
      !isActiveSummarizeStatus(doc.summarizeStatus)
    ) {
      continue;
    }
    if (subscribed.has(doc.id)) continue;
    subscribed.add(doc.id);
    subscribeDocument(doc.id);
  }
}

export function DocumentsProvider({ children }: { children: ReactNode }) {
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { connected } = useWebSocketStatus();
  const subscribedRef = useRef(new Set<string>());
  const onAgentPage = useLocation().pathname.startsWith('/agent');

  async function refresh() {
    try {
      const mapped = await fetchDocuments();
      setError(null);
      setDocuments(mapped);
      subscribeActiveDocuments(mapped, subscribedRef.current);
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
    unsubscribeDocument(id);
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
      setDocuments((prev) => {
        const exists = prev.some((d) => d.id === id);
        if (!exists) return [...prev, mapped];
        return prev.map((doc) => (doc.id === id ? mapped : doc));
      });
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
    subscribeActiveDocuments([mapped], subscribedRef.current);
  }

  async function pause(id: string) {
    await applyMappedUpdate(
      id,
      postJson(`/api/documents/${encodeURIComponent(id)}/pause`),
      'Invalid pause response',
    );
    subscribeDocument(id);
  }

  async function resume(id: string) {
    await applyMappedUpdate(
      id,
      postJson(`/api/documents/${encodeURIComponent(id)}/resume`),
      'Invalid resume response',
    );
    subscribeDocument(id);
  }

  async function rename(id: string, title: string): Promise<DocumentSummary> {
    return applyMappedUpdate(
      id,
      postJson(`/api/documents/${encodeURIComponent(id)}/rename`, { title }),
      'Invalid rename response',
    );
  }

  async function startSummarize(id: string): Promise<DocumentSummary> {
    const mapped = await applyMappedUpdate(
      id,
      startSummarizeRequest(id),
      'Invalid summarize response',
    );
    subscribedRef.current.add(id);
    subscribeDocument(id);
    return mapped;
  }

  async function pauseSummarize(id: string): Promise<DocumentSummary> {
    const mapped = await applyMappedUpdate(
      id,
      pauseSummarizeRequest(id),
      'Invalid summarize pause response',
    );
    subscribeDocument(id);
    return mapped;
  }

  async function resumeSummarize(id: string): Promise<DocumentSummary> {
    const mapped = await applyMappedUpdate(
      id,
      resumeSummarizeRequest(id),
      'Invalid summarize resume response',
    );
    subscribedRef.current.add(id);
    subscribeDocument(id);
    return mapped;
  }

  const refreshFromEffect = useEffectEvent(() => {
    void refresh();
  });

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const mapped = await fetchDocuments();
        if (cancelled) return;
        setError(null);
        setDocuments(mapped);
        subscribeActiveDocuments(mapped, subscribedRef.current);
      } catch (e) {
        if (cancelled) return;
        const message =
          e instanceof Error ? e.message : 'Failed to load documents';
        setError(message);
        console.error('Failed to load documents', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!connected) return;
    let cancelled = false;

    void (async () => {
      try {
        const mapped = await fetchDocuments();
        if (cancelled) return;
        setError(null);
        setDocuments(mapped);
        subscribeActiveDocuments(mapped, subscribedRef.current);
      } catch (e) {
        if (cancelled) return;
        const message =
          e instanceof Error ? e.message : 'Failed to load documents';
        setError(message);
        console.error('Failed to load documents', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [connected]);

  const hasActive = documents.some(
    (d) =>
      isActiveDocumentStatus(d.status) ||
      isActiveSummarizeStatus(d.summarizeStatus),
  );

  useEffect(() => {
    if (!hasActive || onAgentPage) return;

    const timer = window.setInterval(() => {
      refreshFromEffect();
    }, 3000);

    return () => window.clearInterval(timer);
  }, [hasActive, onAgentPage]);

  useWebSocketEvent<DocumentStatusUpdate>(
    'document:status-update',
    (update) => {
      const {
        documentId,
        status,
        progressStage,
        progressDone,
        progressTotal,
        summarizeStatus,
        summarizeDone,
        summarizeTotal,
        summarizeError,
      } = update;

      const hasSummarize = Object.prototype.hasOwnProperty.call(
        update,
        'summarizeStatus',
      );

      if (
        hasSummarize &&
        (summarizeStatus === null || summarizeStatus === 'failed')
      ) {
        void refresh();
        return;
      }

      const normalized =
        status !== undefined ? normalizeDocumentStatus(status) : null;
      if (status !== undefined && !normalized) return;

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

          let next = doc;
          if (
            normalized === 'processing' &&
            (doc.status === 'processing' || doc.status === 'uploading')
          ) {
            next = {
              ...next,
              status: normalized,
              progressStage: isDocumentProgressStage(progressStage)
                ? progressStage
                : undefined,
              progressDone,
              progressTotal,
            };
          }

          if (hasSummarize) {
            next = {
              ...next,
              summarizeStatus: isSummarizeStatus(summarizeStatus)
                ? summarizeStatus
                : next.summarizeStatus,
              summarizeDone:
                summarizeDone !== undefined
                  ? summarizeDone
                  : next.summarizeDone,
              summarizeTotal:
                summarizeTotal !== undefined
                  ? summarizeTotal
                  : next.summarizeTotal,
              summarizeError:
                summarizeError !== undefined
                  ? summarizeError
                  : next.summarizeError,
            };
          }

          return next;
        });
      });

      if (missing) void refresh();
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
        rename,
        startSummarize,
        pauseSummarize,
        resumeSummarize,
        connected,
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
