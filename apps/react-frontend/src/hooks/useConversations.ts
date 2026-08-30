import { useEffect, useState } from 'react';
import { deleteJson, getJson } from '../api/client';
import {
  mapConversationMessages,
  mapConversations,
  toChatMessages,
} from '../lib/conversations';
import type { ConversationSummary, Message } from '@ragpolyglot-shared';

export function useConversations() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      setError(null);
      const data = await getJson<unknown>('/api/conversations');
      setConversations(mapConversations(data));
    } catch (e) {
      const message =
        e instanceof Error ? e.message : 'Failed to load conversations';
      setError(message);
      console.error('Failed to load conversations', e);
    } finally {
      setLoading(false);
    }
  }

  async function loadMessages(id: string): Promise<Message[]> {
    const data = await getJson<unknown>(
      `/api/conversations/${encodeURIComponent(id)}/messages`,
    );
    return toChatMessages(mapConversationMessages(data));
  }

  async function remove(id: string) {
    await deleteJson(`/api/conversations/${encodeURIComponent(id)}`);
    setConversations((prev) => prev.filter((c) => c.id !== id));
  }

  useEffect(() => {
    void refresh();
  }, []);

  return { conversations, loading, error, refresh, loadMessages, remove };
}
