import { useState, useEffect, useRef, useCallback } from 'react';
import { emitWebSocket, useWebSocketEvent } from '../hooks/useWebSocket';
import { formatSimilarityPercent } from '../lib/documents';
import type { Message, Source } from '@ragpolyglot-shared';

interface ChatCompletePayload {
  conversationId: string;
  sources?: Source[];
  error?: boolean;
  interrupted?: boolean;
}

function sourceLabel(source: Source): string {
  if (source.documentTitle?.trim()) return source.documentTitle;
  if (source.documentId) return `Doc ${source.documentId.slice(0, 8)}`;
  return 'Source';
}

export function AgentChat({ hasDocuments }: { hasDocuments: boolean }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const activeConversationIdRef = useRef<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useWebSocketEvent<{ token: string; conversationId: string }>(
    'chat:token',
    ({ token, conversationId }) => {
      if (
        !activeConversationIdRef.current ||
        conversationId !== activeConversationIdRef.current
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
    if (
      !activeConversationIdRef.current ||
      payload.conversationId !== activeConversationIdRef.current
    ) {
      return;
    }

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
      setLoading(false);
      activeConversationIdRef.current = null;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (!last || last.role !== 'assistant') return prev;
        return [
          ...prev.slice(0, -1),
          {
            ...last,
            text: last.text.trim() || 'Request timed out.',
          },
        ];
      });
    }, 60_000);
    return () => window.clearTimeout(timer);
  }, [loading]);

  const interrupt = useCallback(() => {
    const conversationId = activeConversationIdRef.current;
    if (!conversationId) return;
    emitWebSocket('chat:interrupt', { conversationId });
  }, []);

  const send = () => {
    if (!input.trim() || !hasDocuments || loading) return;

    const query = input.trim();
    const conversationId = crypto.randomUUID();

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

  if (!hasDocuments) {
    return (
      <div
        className="flex flex-col h-[600px] bg-gray-900 rounded-xl border border-gray-800 items-center justify-center text-center p-8"
        role="status"
      >
        <p className="text-gray-300 mb-2">No documents available yet.</p>
        <p className="text-sm text-gray-500">
          Upload at least one document and wait until it is Ready.
        </p>
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
                  {m.sources.map((s, idx) => (
                    <div
                      key={`${s.documentId}-${idx}`}
                      className="bg-gray-800/50 border border-gray-700 rounded-lg p-3 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-indigo-400 truncate">
                          {sourceLabel(s)}
                        </span>
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
          placeholder="Ask about your documents..."
          disabled={!hasDocuments || loading}
          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-sm outline-none focus:border-indigo-500 disabled:opacity-50"
        />
        {loading ? (
          <button
            type="button"
            onClick={interrupt}
            className="px-4 py-2 rounded-lg bg-red-600/80 hover:bg-red-500 text-white font-medium text-sm"
          >
            Stop
          </button>
        ) : (
          <button
            type="button"
            onClick={send}
            disabled={!input.trim()}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium text-sm"
          >
            Send
          </button>
        )}
      </div>
    </div>
  );
}
