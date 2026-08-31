import { useEffect, useRef, useState } from 'react';
import { AgentChat } from '../components/AgentChat';
import { ConversationSidebar } from '../components/ConversationSidebar';
import { useConversations } from '../hooks/useConversations';
import type { Message } from '@ragpolyglot-shared';

export function AgentPage() {
  const { conversations, loading, error, refresh, loadMessages, remove } =
    useConversations();
  const [conversationId, setConversationId] = useState<string>(() =>
    crypto.randomUUID(),
  );
  const [initialMessages, setInitialMessages] = useState<Message[]>([]);
  const restoredRef = useRef(false);

  const openConversation = async (id: string) => {
    try {
      const messages = await loadMessages(id);
      setConversationId(id);
      setInitialMessages(messages);
    } catch (e) {
      console.error('Failed to load conversation', e);
    }
  };

  const latestId = conversations[0]?.id;

  useEffect(() => {
    if (restoredRef.current || loading || !latestId) return;
    restoredRef.current = true;
    void openConversation(latestId);
  }, [loading, latestId]);

  const startNew = () => {
    restoredRef.current = true;
    setConversationId(crypto.randomUUID());
    setInitialMessages([]);
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
        Answers are generated from retrieved document chunks using the
        configured LLM.
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
            onTurnComplete={() => void refresh()}
          />
        </div>
      </div>
    </div>
  );
}
