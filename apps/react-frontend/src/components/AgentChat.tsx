import { useState, useEffect, useEffectEvent, useRef } from 'react';
import { getJson } from '../api/client';
import {
  emitWebSocket,
  subscribeConversation,
  unsubscribeConversation,
  useWebSocketEvent,
} from '../hooks/useWebSocket';
import { useDocuments } from '../context/DocumentsProvider';
import { Button, ButtonLink } from './Button';
import { ChatMessageList } from './ChatMessageList';
import {
  appendAssistantText,
  applyChatComplete,
  finishAssistantMessage,
} from '../lib/chatMessages';
import { mapConversationMessages, toChatMessages } from '../lib/conversations';
import { AGENT_PANEL_HEIGHT } from '../lib/agentLayout';
import type {
  ChatCompletePayload,
  ChatDeepStatus,
  ChatProgressPayload,
  Message,
} from '@ragpolyglot-shared';

type ChatMode = 'fast' | 'deep';

function progressLabel(done: number, total: number): string {
  if (total > 0) return `Deep search ${done}/${total}`;
  return 'Deep search running…';
}

export function AgentChat({
  conversationId,
  initialMessages,
  documentIds,
}: {
  conversationId: string;
  initialMessages: Message[];
  documentIds: string[];
}) {
  const { documents } = useDocuments();
  const hasDocuments =
    documentIds.length > 0 || documents.some((d) => d.status === 'ready');

  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<ChatMode>('fast');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const activeConversationIdRef = useRef<string | null>(null);
  const modeRef = useRef<ChatMode>(mode);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const stickToBottomRef = useRef(true);
  const pendingTokensRef = useRef('');
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const clearPending = () => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const pending = pendingTokensRef.current;
    pendingTokensRef.current = '';
    return pending;
  };

  useEffect(() => {
    subscribeConversation(conversationId);
    return () => {
      unsubscribeConversation(conversationId);
      clearPending();
      const id = activeConversationIdRef.current;
      if (!id) return;
      activeConversationIdRef.current = null;
      if (modeRef.current === 'fast') {
        emitWebSocket('chat:interrupt', { conversationId: id });
      }
    };
  }, [conversationId]);

  useEffect(() => {
    let cancelled = false;
    void getJson<ChatDeepStatus>(
      `/api/conversations/${encodeURIComponent(conversationId)}/deep`,
    )
      .then((status) => {
        if (cancelled || !status.running || !status.query) return;
        setMode('deep');
        modeRef.current = 'deep';
        setLoading(true);
        activeConversationIdRef.current = conversationId;
        setProgress(progressLabel(status.done ?? 0, status.total ?? 0));
        const queryText = status.query;
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === 'assistant' && last.text === '') return prev;
          const hasUser = prev.some(
            (m) => m.role === 'user' && m.text === queryText,
          );
          if (hasUser && last?.role === 'assistant') return prev;
          return [
            ...prev,
            ...(hasUser ? [] : [{ role: 'user' as const, text: queryText }]),
            { role: 'assistant' as const, text: '' },
          ];
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  useWebSocketEvent<{ token: string; conversationId: string }>(
    'chat:token',
    ({ token, conversationId: id }) => {
      if (id !== activeConversationIdRef.current) return;
      setProgress(null);
      pendingTokensRef.current += token;
      if (rafRef.current != null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        const pending = pendingTokensRef.current;
        pendingTokensRef.current = '';
        if (!pending) return;
        setMessages((prev) =>
          activeConversationIdRef.current
            ? appendAssistantText(prev, pending)
            : prev,
        );
      });
    },
  );

  useWebSocketEvent<ChatProgressPayload>('chat:progress', (payload) => {
    if (payload.conversationId !== conversationId) return;
    if (activeConversationIdRef.current !== conversationId) {
      activeConversationIdRef.current = conversationId;
      setLoading(true);
      setMode('deep');
      modeRef.current = 'deep';
    }
    setProgress(progressLabel(payload.done, payload.total));
  });

  useWebSocketEvent<ChatCompletePayload>('chat:complete', (payload) => {
    if (payload.conversationId !== conversationId) return;
    if (
      activeConversationIdRef.current !== conversationId &&
      !payload.interrupted
    ) {
      activeConversationIdRef.current = conversationId;
    }
    if (activeConversationIdRef.current !== conversationId) return;

    const pending = clearPending();
    setLoading(false);
    setProgress(null);
    activeConversationIdRef.current = null;

    const wasDeep = modeRef.current === 'deep';
    if (wasDeep && !payload.interrupted) {
      void getJson<unknown>(
        `/api/conversations/${encodeURIComponent(conversationId)}/messages`,
      )
        .then((rows) => {
          setMessages(toChatMessages(mapConversationMessages(rows)));
        })
        .catch(() => {
          setMessages((prev) => applyChatComplete(prev, pending, payload));
        });
    } else {
      setMessages((prev) => applyChatComplete(prev, pending, payload));
    }
  });

  useEffect(() => {
    if (!stickToBottomRef.current) return;
    messagesEndRef.current?.scrollIntoView({
      behavior: loading ? 'auto' : 'smooth',
    });
  }, [messages, loading, progress]);

  const stop = (fallback: string, keepPending: boolean) => {
    const id = activeConversationIdRef.current;
    if (!id) return;
    emitWebSocket('chat:interrupt', { conversationId: id });
    activeConversationIdRef.current = null;
    const pending = clearPending();
    setLoading(false);
    setProgress(null);
    setMessages((prev) =>
      finishAssistantMessage(
        keepPending ? appendAssistantText(prev, pending) : prev,
        fallback,
      ),
    );
  };

  const onRequestTimeout = useEffectEvent(() => {
    stop('Request timed out.', true);
  });

  useEffect(() => {
    if (!loading || mode === 'deep') return;
    const timer = window.setTimeout(() => onRequestTimeout(), 120_000);
    return () => window.clearTimeout(timer);
  }, [loading, mode]);

  const send = () => {
    if (!input.trim() || !hasDocuments || loading) return;

    const query = input.trim();

    setInput('');
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
    setLoading(true);
    setProgress(mode === 'deep' ? 'Deep search starting…' : null);
    stickToBottomRef.current = true;
    activeConversationIdRef.current = conversationId;
    setMessages((prev) => [
      ...prev,
      { role: 'user', text: query },
      { role: 'assistant', text: '' },
    ]);

    emitWebSocket('chat:query', {
      query,
      conversationId,
      mode,
      ...(documentIds.length > 0 ? { documentIds } : {}),
    });
  };

  if (!hasDocuments && messages.length === 0) {
    return (
      <div
        className={`flex flex-col ${AGENT_PANEL_HEIGHT} bg-gray-900 rounded-xl border border-gray-800 items-center justify-center text-center p-8`}
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
      className={`flex flex-col ${AGENT_PANEL_HEIGHT} overflow-hidden bg-gray-900 rounded-xl border border-gray-800`}
      aria-label="Document chat"
    >
      <ChatMessageList
        messages={messages}
        documents={documents}
        endRef={messagesEndRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottomRef.current =
            el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
      />

      {progress && (
        <p className="px-4 py-1 text-xs text-amber-400/90 border-t border-gray-800 shrink-0">
          {progress}
        </p>
      )}

      <div className="border-t border-gray-800 p-3 flex gap-2 items-end shrink-0">
        <div className="relative shrink-0">
          <label htmlFor="agent-chat-mode" className="sr-only">
            Mode
          </label>
          <select
            id="agent-chat-mode"
            value={mode}
            disabled={loading}
            onChange={(e) => setMode(e.target.value as ChatMode)}
            className="appearance-none h-10 pl-3 pr-8 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 outline-none focus:border-indigo-500 disabled:opacity-50"
          >
            <option value="fast">Fast</option>
            <option value="deep">Deep</option>
          </select>
          <span
            aria-hidden
            className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-base leading-none text-gray-400"
          >
            ▾
          </span>
        </div>
        <label htmlFor="agent-chat-input" className="sr-only">
          Message
        </label>
        <textarea
          id="agent-chat-input"
          ref={inputRef}
          rows={1}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            const el = e.currentTarget;
            el.style.height = 'auto';
            el.style.height = `${el.scrollHeight}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder={
            hasDocuments
              ? documentIds.length > 0
                ? 'Ask about the selected documents...'
                : 'Ask about your documents...'
              : 'Upload a ready document to continue this chat'
          }
          disabled={!hasDocuments || loading}
          className="flex-1 min-h-10 max-h-40 resize-none overflow-y-auto bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm leading-5 outline-none focus:border-indigo-500 disabled:opacity-50"
        />
        {loading ? (
          <Button
            variant="danger"
            className="shrink-0"
            onClick={() => stop('(interrupted)', false)}
          >
            Stop
          </Button>
        ) : (
          <Button
            className="shrink-0"
            onClick={send}
            disabled={!hasDocuments || !input.trim()}
          >
            Send
          </Button>
        )}
      </div>
    </div>
  );
}
