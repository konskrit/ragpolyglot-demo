import { useEffect, useState } from 'react';
import { deleteJson, getJson } from '../api/client';
import {
  mapConversation,
  mapConversationMessages,
  mapConversations,
  toChatMessages,
} from '../lib/conversations';
import type { ConversationSummary, Message } from '@ragpolyglot-shared';

async function fetchConversations(): Promise<ConversationSummary[]> {
  const data = await getJson<unknown>('/api/conversations');
  return mapConversations(data);
}

export function useConversations() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      const next = await fetchConversations();
      setError(null);
      setConversations(next);
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

  async function loadConversation(
    id: string,
  ): Promise<{ messages: Message[]; documentIds: string[] }> {
    const [messages, summaryRaw] = await Promise.all([
      loadMessages(id),
      getJson<unknown>(`/api/conversations/${encodeURIComponent(id)}`),
    ]);
    const summary = mapConversation(summaryRaw);
    return {
      messages,
      documentIds: summary?.documentIds ?? [],
    };
  }

  async function remove(id: string) {
    await deleteJson(`/api/conversations/${encodeURIComponent(id)}`);
    setConversations((prev) => prev.filter((c) => c.id !== id));
  }

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const next = await fetchConversations();
        if (cancelled) return;
        setError(null);
        setConversations(next);
      } catch (e) {
        if (cancelled) return;
        const message =
          e instanceof Error ? e.message : 'Failed to load conversations';
        setError(message);
        console.error('Failed to load conversations', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return {
    conversations,
    loading,
    error,
    refresh,
    loadMessages,
    loadConversation,
    remove,
  };
}
