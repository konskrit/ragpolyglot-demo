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
    this.ensureReady();
    const rows = await this.postgres.exec<ConversationRow>(
      loadSql('list-conversations.sql'),
    );
    return rows.map(toSummary);
  }

  async getMessages(id: string): Promise<ConversationMessage[]> {
    this.ensureReady();
    const existing = await this.postgres.exec<ConversationRow>(
      loadSql('get-conversation.sql'),
      [id],
    );
    if (!existing[0]) {
      throw new NotFoundException('Conversation not found');
    }
    const rows = await this.postgres.exec<MessageRow>(
      loadSql('list-messages.sql'),
      [id],
    );
    return rows.map(toMessage);
  }

  async delete(id: string): Promise<void> {
    this.ensureReady();
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
  ): Promise<void> {
    if (!this.postgres.isReady()) return;
    const insertMessage = loadSql('insert-message.sql');
    await this.postgres.runInTransaction([
      {
        text: loadSql('upsert-conversation.sql'),
        params: [conversationId, conversationTitleFromQuery(query)],
      },
      {
        text: insertMessage,
        params: [conversationId, 'user', query, null],
      },
      {
        text: insertMessage,
        params: [
          conversationId,
          'assistant',
          answer,
          sources.length > 0 ? sources : null,
        ],
      },
    ]);
  }

  private ensureReady(): void {
    if (!this.postgres.isReady()) {
      throw new ServiceUnavailableException('Chat history is unavailable');
    }
  }
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function toSummary(row: ConversationRow): ConversationSummary {
  return {
    id: row.id,
    title: row.title,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
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
