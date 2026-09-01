import { Link } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { emitWebSocket, useWebSocketEvent } from '../hooks/useWebSocket';
import { useDocuments } from '../context/DocumentsProvider';
import { Button, ButtonLink } from './Button';
import { formatSimilarityPercent } from '../lib/formatSimilarity';
import { chunkAnchorId } from '../lib/chunkAnchor';
import type {
  ChatCompletePayload,
  DocumentSummary,
  Message,
  Source,
} from '@ragpolyglot-shared';

function sourceLabel(source: Source, documents: DocumentSummary[]): string {
  if (source.documentTitle?.trim()) return source.documentTitle;
  const doc = documents.find((d) => d.id === source.documentId);
  if (doc?.title?.trim()) return doc.title;
  if (source.documentId) return `Doc ${source.documentId.slice(0, 8)}`;
  return 'Source';
}

function sourceLink(source: Source): {
  pathname: string;
  hash?: string;
  state?: { chunkIndex: number };
} {
  const pathname = `/documents/${source.documentId}`;
  if (typeof source.chunkIndex !== 'number') {
    return { pathname };
  }
  return {
    pathname,
    hash: chunkAnchorId(source.chunkIndex),
    state: { chunkIndex: source.chunkIndex },
  };
}

export function AgentChat({
  conversationId,
  initialMessages,
  onTurnComplete,
}: {
  conversationId: string;
  initialMessages: Message[];
  onTurnComplete: () => void;
}) {
  const { documents } = useDocuments();
  const hasDocuments = documents.some((d) => d.status === 'ready');

  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const activeConversationIdRef = useRef<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const finishAssistant = (fallbackText: string, sources?: Source[]) => {
    setLoading(false);
    activeConversationIdRef.current = null;
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (!last || last.role !== 'assistant') return prev;
      return [
        ...prev.slice(0, -1),
        {
          ...last,
          text: last.text.trim() || fallbackText,
          ...(sources ? { sources } : {}),
        },
      ];
    });
  };

  useWebSocketEvent<{ token: string; conversationId: string }>(
    'chat:token',
    ({ token, conversationId: id }) => {
      if (
        !activeConversationIdRef.current ||
        id !== activeConversationIdRef.current
      ) {
        return;
      }

      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (!last || last.role !== 'assistant') return prev;
        return [...prev.slice(0, -1), { ...last, text: last.text + token }];
      });
    },
  );

  useWebSocketEvent<ChatCompletePayload>('chat:complete', (payload) => {
    if (payload.conversationId !== conversationId) return;

    setLoading(false);
    activeConversationIdRef.current = null;

    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (!last || last.role !== 'assistant') return prev;

      let text = last.text;
      if (payload.interrupted && !text.trim()) {
        text = '(interrupted)';
      } else if (payload.error && !text.trim()) {
        text = 'Sorry, something went wrong.';
      }

      return [
        ...prev.slice(0, -1),
        {
          ...last,
          text,
          sources: payload.sources ?? [],
        },
      ];
    });
    onTurnComplete();
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!loading) return;
    const timer = window.setTimeout(() => {
      if (!activeConversationIdRef.current) return;
      emitWebSocket('chat:interrupt', {
        conversationId: activeConversationIdRef.current,
      });
      finishAssistant('Request timed out.');
    }, 120_000);
    return () => window.clearTimeout(timer);
  }, [loading]);

  const interrupt = () => {
    const id = activeConversationIdRef.current;
    if (!id) return;
    emitWebSocket('chat:interrupt', { conversationId: id });
    finishAssistant('(interrupted)');
  };

  const send = () => {
    if (!input.trim() || !hasDocuments || loading) return;

    const query = input.trim();

    setInput('');
    setLoading(true);
    activeConversationIdRef.current = conversationId;
    setMessages((prev) => [
      ...prev,
      { role: 'user', text: query },
      { role: 'assistant', text: '' },
    ]);

    emitWebSocket('chat:query', { query, conversationId });
  };

  if (!hasDocuments && messages.length === 0) {
    return (
      <div
        className="flex flex-col h-[600px] bg-gray-900 rounded-xl border border-gray-800 items-center justify-center text-center p-8"
        role="status"
      >
        <p className="text-gray-300 mb-2">No documents available yet.</p>
        <p className="text-sm text-gray-500 mb-4">
          Upload at least one document and wait until it is Ready.
        </p>
        <ButtonLink to="/upload">Upload documents</ButtonLink>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col h-[600px] bg-gray-900 rounded-xl border border-gray-800"
      aria-label="Document chat"
    >
      <div
        className="flex-1 overflow-y-auto p-4 space-y-4"
        role="log"
        aria-live="polite"
        aria-relevant="additions"
      >
        {messages.length === 0 && (
          <p className="text-center text-gray-500 mt-8">
            Ask a question about your uploaded documents.
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div className="max-w-[80%] space-y-2">
              <div
                className={`rounded-lg px-4 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-800 text-gray-100'
                }`}
              >
                {m.text || <span className="animate-pulse">Retrieving…</span>}
              </div>

              {m.sources && m.sources.length > 0 && (
                <div className="space-y-2 ml-2 mt-1">
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                    Sources
                  </p>
                  {m.sources.map((s) => (
                    <div
                      key={`${s.documentId}-${s.chunkIndex ?? 'x'}-${s.similarity}`}
                      className="bg-gray-800/50 border border-gray-700 rounded-lg p-3 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        {s.documentId ? (
                          <Link
                            to={sourceLink(s)}
                            className="font-medium text-indigo-400 truncate hover:text-indigo-300 hover:underline"
                          >
                            {sourceLabel(s, documents)}
                            {typeof s.chunkIndex === 'number'
                              ? ` · chunk ${s.chunkIndex + 1}`
                              : ''}
                          </Link>
                        ) : (
                          <span className="font-medium text-indigo-400 truncate">
                            {sourceLabel(s, documents)}
                          </span>
                        )}
                        <span className="text-green-400 font-mono shrink-0">
                          {formatSimilarityPercent(s.similarity)}
                        </span>
                      </div>
                      <p className="text-gray-500 line-clamp-2">
                        {s.chunkContent}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-gray-800 p-4 flex gap-2">
        <label htmlFor="agent-chat-input" className="sr-only">
          Message
        </label>
        <input
          id="agent-chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder={
            hasDocuments
              ? 'Ask about your documents...'
              : 'Upload a ready document to continue this chat'
          }
          disabled={!hasDocuments || loading}
          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-sm outline-none focus:border-indigo-500 disabled:opacity-50"
        />
        {loading ? (
          <Button variant="danger" onClick={interrupt}>
            Stop
          </Button>
        ) : (
          <Button onClick={send} disabled={!hasDocuments || !input.trim()}>
            Send
          </Button>
        )}
      </div>
    </div>
  );
}
