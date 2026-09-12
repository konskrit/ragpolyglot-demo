import type {
  ConversationMessage,
  ConversationSummary,
  Message,
} from '@ragpolyglot-shared';
import { isChatRole, parseRagSources } from '@ragpolyglot-shared';

function toIso(value: unknown): string | undefined {
  if (typeof value === 'string' && value) return value;
  return undefined;
}

export function mapConversation(item: unknown): ConversationSummary | null {
  if (!item || typeof item !== 'object') return null;
  const row = item as Record<string, unknown>;
  const createdAt = toIso(row.createdAt);
  const updatedAt = toIso(row.updatedAt);
  if (
    typeof row.id !== 'string' ||
    typeof row.title !== 'string' ||
    !createdAt ||
    !updatedAt
  ) {
    return null;
  }
  const documentIds = parseDocumentIds(row.documentIds);
  return {
    id: row.id,
    title: row.title,
    createdAt,
    updatedAt,
    ...(documentIds ? { documentIds } : {}),
  };
}

function parseDocumentIds(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const ids = raw.filter(
    (id): id is string => typeof id === 'string' && id.trim().length > 0,
  );
  return ids.length > 0 ? ids : undefined;
}

function mapMessage(item: unknown): ConversationMessage | null {
  if (!item || typeof item !== 'object') return null;
  const row = item as Record<string, unknown>;
  const id = typeof row.id === 'number' ? row.id : Number(row.id);
  const createdAt = toIso(row.createdAt);
  if (
    !Number.isFinite(id) ||
    typeof row.conversationId !== 'string' ||
    !isChatRole(row.role) ||
    typeof row.text !== 'string' ||
    !createdAt
  ) {
    return null;
  }
  return {
    id,
    conversationId: row.conversationId,
    role: row.role,
    text: row.text,
    sources: parseRagSources(row.sources),
    createdAt,
  };
}

export function mapConversations(data: unknown): ConversationSummary[] {
  if (!Array.isArray(data)) return [];
  return data
    .map(mapConversation)
    .filter((row): row is ConversationSummary => row !== null);
}

export function mapConversationMessages(data: unknown): ConversationMessage[] {
  if (!Array.isArray(data)) return [];
  return data
    .map(mapMessage)
    .filter((row): row is ConversationMessage => row !== null);
}

export function toChatMessages(messages: ConversationMessage[]): Message[] {
  return messages.map(({ role, text, sources }) => ({
    role,
    text,
    sources,
  }));
}
