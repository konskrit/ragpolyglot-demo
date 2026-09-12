import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AgentChat } from '../components/AgentChat';
import { ChatDocumentScope } from '../components/ChatDocumentScope';
import { ConversationSidebar } from '../components/ConversationSidebar';
import { useConversations } from '../hooks/useConversations';
import { useDocuments } from '../context/DocumentsProvider';
import { useWebSocketEvent } from '../hooks/useWebSocket';
import type {
  ChatCompletePayload,
  ChatStartedPayload,
  Message,
} from '@ragpolyglot-shared';

export function AgentPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const seed = searchParams.get('documentId')?.trim() || '';
  const { documents } = useDocuments();
  const { conversations, loading, error, refresh, loadConversation, remove } =
    useConversations();
  const [conversationId, setConversationId] = useState<string>(() =>
    crypto.randomUUID(),
  );
  const [initialMessages, setInitialMessages] = useState<Message[]>([]);
  const [documentIds, setDocumentIds] = useState<string[]>(() =>
    seed ? [seed] : [],
  );
  const skipRestoreRef = useRef(Boolean(seed));
  const restoredRef = useRef(false);
  const openSeqRef = useRef(0);

  const clearSeedParam = () => {
    if (!searchParams.has('documentId')) return;
    const next = new URLSearchParams(searchParams);
    next.delete('documentId');
    setSearchParams(next, { replace: true });
  };

  const openConversation = async (id: string) => {
    const seq = ++openSeqRef.current;
    try {
      const { messages, documentIds: scopeIds } = await loadConversation(id);
      if (seq !== openSeqRef.current) return;
      setConversationId(id);
      setInitialMessages(messages);
      setDocumentIds(scopeIds);
      clearSeedParam();
    } catch (e) {
      if (seq !== openSeqRef.current) return;
      console.error('Failed to load conversation', e);
    }
  };

  const latestId = conversations[0]?.id;

  const restoreLatest = useEffectEvent((id: string) => {
    void openConversation(id);
  });

  useEffect(() => {
    if (skipRestoreRef.current || restoredRef.current || loading || !latestId) {
      return;
    }
    restoredRef.current = true;
    restoreLatest(latestId);
  }, [loading, latestId]);

  useWebSocketEvent<ChatStartedPayload>('chat:started', () => {
    void refresh();
  });

  useWebSocketEvent<ChatCompletePayload>('chat:complete', () => {
    void refresh();
  });

  const setScope = (ids: string[]) => {
    setDocumentIds(ids);
    clearSeedParam();
  };

  const startNew = () => {
    openSeqRef.current++;
    restoredRef.current = true;
    skipRestoreRef.current = true;
    setConversationId(crypto.randomUUID());
    setInitialMessages([]);
    setDocumentIds([]);
    clearSeedParam();
  };

  const deleteConversation = async (id: string) => {
    try {
      await remove(id);
      if (id === conversationId) {
        startNew();
      }
    } catch (e) {
      console.error('Failed to delete conversation', e);
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      <h1 className="text-3xl font-semibold mb-2">Agent Mode</h1>
      <p className="text-gray-400 mb-2">
        Ask questions grounded in your uploaded documents.
      </p>
      <p className="text-sm text-gray-500 mb-8">
        Answers use retrieved chunks from the configured LLM. Use the context
        panel to search all documents or a selected subset.
      </p>
      <div className="flex gap-4 items-stretch">
        <ConversationSidebar
          conversations={conversations}
          selectedId={conversationId}
          loading={loading}
          error={error}
          onSelect={(id) => void openConversation(id)}
          onNew={startNew}
          onDelete={(id) => void deleteConversation(id)}
        />
        <div className="flex-1 min-w-0">
          <AgentChat
            key={conversationId}
            conversationId={conversationId}
            initialMessages={initialMessages}
            documentIds={documentIds}
          />
        </div>
        <ChatDocumentScope
          documents={documents}
          selectedIds={documentIds}
          onChange={setScope}
        />
      </div>
    </div>
  );
}
