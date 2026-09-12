import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  conversationTitleFromQuery,
  isChatRole,
  parseRagSources,
  type ConversationMessage,
  type ConversationSummary,
  type Source,
} from '@ragpolyglot-shared';
import { PostgresService } from '../core/postgres.service';
import { loadSql } from '../core/load-sql';

type ConversationRow = {
  id: string;
  title: string;
  documentIds?: unknown;
  createdAt: Date | string;
  updatedAt: Date | string;
};

type MessageRow = {
  id: string | number;
  conversationId: string;
  role: string;
  text: string;
  sources: unknown;
  createdAt: Date | string;
};

@Injectable()
export class ConversationService {
  constructor(private readonly postgres: PostgresService) {}

  async list(): Promise<ConversationSummary[]> {
    await this.ensureReady();
    const rows = await this.postgres.exec<ConversationRow>(
      loadSql('list-conversations.sql'),
    );
    return rows.map(toSummary);
  }

  async get(id: string): Promise<ConversationSummary> {
    await this.ensureReady();
    const rows = await this.postgres.exec<ConversationRow>(
      loadSql('get-conversation.sql'),
      [id],
    );
    if (!rows[0]) {
      throw new NotFoundException('Conversation not found');
    }
    return toSummary(rows[0]);
  }

  async getMessages(id: string): Promise<ConversationMessage[]> {
    await this.ensureReady();
    await this.get(id);
    const rows = await this.postgres.exec<MessageRow>(
      loadSql('list-messages.sql'),
      [id],
    );
    return rows.map(toMessage);
  }

  async delete(id: string): Promise<void> {
    await this.ensureReady();
    const rows = await this.postgres.exec(loadSql('delete-conversation.sql'), [
      id,
    ]);
    if (rows.length === 0) {
      throw new NotFoundException('Conversation not found');
    }
  }

  async persistTurn(
    conversationId: string,
    query: string,
    answer: string,
    sources: Source[],
    documentIds?: string[],
  ): Promise<void> {
    await this.beginTurn(conversationId, query, documentIds);
    await this.completeAssistant(conversationId, answer, sources);
  }

  async beginTurn(
    conversationId: string,
    query: string,
    documentIds?: string[],
  ): Promise<void> {
    await this.ensureReady();
    const insertMessage = loadSql('insert-message.sql');
    await this.postgres.runInTransaction([
      {
        text: loadSql('upsert-conversation.sql'),
        params: [
          conversationId,
          conversationTitleFromQuery(query),
          toDocumentIdsParam(documentIds),
        ],
      },
      {
        text: insertMessage,
        params: [conversationId, 'user', query, null],
      },
    ]);
  }

  async completeAssistant(
    conversationId: string,
    answer: string,
    sources: Source[],
  ): Promise<void> {
    await this.ensureReady();
    await this.postgres.runInTransaction([
      {
        text: loadSql('touch-conversation.sql'),
        params: [conversationId],
      },
      {
        text: loadSql('insert-message.sql'),
        params: [
          conversationId,
          'assistant',
          answer,
          sources.length > 0 ? JSON.stringify(sources) : null,
        ],
      },
    ]);
  }

  private async ensureReady(): Promise<void> {
    if (!(await this.postgres.ensureReady())) {
      throw new ServiceUnavailableException('Chat history is unavailable');
    }
  }
}

function toDocumentIdsParam(documentIds?: string[]): string {
  return JSON.stringify(documentIds ?? []);
}

function parseDocumentIds(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const ids = raw.filter(
    (id): id is string => typeof id === 'string' && id.trim().length > 0,
  );
  return ids.length > 0 ? ids : undefined;
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function toSummary(row: ConversationRow): ConversationSummary {
  const documentIds = parseDocumentIds(row.documentIds);
  return {
    id: row.id,
    title: row.title,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
    ...(documentIds ? { documentIds } : {}),
  };
}

function toMessage(row: MessageRow): ConversationMessage {
  return {
    id: Number(row.id),
    conversationId: row.conversationId,
    role: isChatRole(row.role) ? row.role : 'assistant',
    text: row.text,
    sources: parseRagSources(row.sources),
    createdAt: toIso(row.createdAt),
  };
}
