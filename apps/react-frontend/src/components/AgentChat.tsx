import { useState, useEffect, useRef } from 'react';
import { emitWebSocket, useWebSocketEvent } from '../hooks/useWebSocket';
import { useDocuments } from '../context/DocumentsProvider';
import { Button, ButtonLink } from './Button';
import { ChatMessageList } from './ChatMessageList';
import {
  appendAssistantText,
  applyChatComplete,
  finishAssistantMessage,
} from '../lib/chatMessages';
import type { ChatCompletePayload, Message } from '@ragpolyglot-shared';

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
  const stickToBottomRef = useRef(true);
  const pendingTokensRef = useRef('');
  const rafRef = useRef<number | null>(null);

  const clearPending = () => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const pending = pendingTokensRef.current;
    pendingTokensRef.current = '';
    return pending;
  };

  useEffect(
    () => () => {
      clearPending();
    },
    [],
  );

  useWebSocketEvent<{ token: string; conversationId: string }>(
    'chat:token',
    ({ token, conversationId: id }) => {
      if (id !== activeConversationIdRef.current) return;
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

  useWebSocketEvent<ChatCompletePayload>('chat:complete', (payload) => {
    if (payload.conversationId !== conversationId) return;

    const pending = clearPending();
    setLoading(false);
    activeConversationIdRef.current = null;
    setMessages((prev) => applyChatComplete(prev, pending, payload));
    onTurnComplete();
  });

  useEffect(() => {
    if (!stickToBottomRef.current) return;
    messagesEndRef.current?.scrollIntoView({
      behavior: loading ? 'auto' : 'smooth',
    });
  }, [messages, loading]);

  const stop = (fallback: string, keepPending: boolean) => {
    const id = activeConversationIdRef.current;
    if (!id) return;
    emitWebSocket('chat:interrupt', { conversationId: id });
    activeConversationIdRef.current = null;
    const pending = clearPending();
    setLoading(false);
    setMessages((prev) =>
      finishAssistantMessage(
        keepPending ? appendAssistantText(prev, pending) : prev,
        fallback,
      ),
    );
  };

  useEffect(() => {
    if (!loading) return;
    const timer = window.setTimeout(
      () => stop('Request timed out.', true),
      120_000,
    );
    return () => window.clearTimeout(timer);
  }, [loading]);

  const send = () => {
    if (!input.trim() || !hasDocuments || loading) return;

    const query = input.trim();

    setInput('');
    setLoading(true);
    stickToBottomRef.current = true;
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
        className="flex flex-col h-150 bg-gray-900 rounded-xl border border-gray-800 items-center justify-center text-center p-8"
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
      className="flex flex-col h-150 bg-gray-900 rounded-xl border border-gray-800"
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
          <Button variant="danger" onClick={() => stop('(interrupted)', false)}>
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
