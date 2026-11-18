import {
  ChatRole,
  ConfigValueKind,
  DocumentProgressStage,
  DocumentStatus,
  OcrEngine,
  OcrLanguageCode,
  SummarizeStatus,
} from '../types/types';

import type { Source } from '../generated/wire';

export type {
  ChatCompletePayload,
  ChatProgressPayload,
  ChatRequest,
  ChatResponse,
  ChatStartedPayload,
  ChatStreamDoneEvent,
  ChatStreamErrorEvent,
  ChatStreamProgressEvent,
  ChatStreamTokenEvent,
  DocumentCreateDto,
  DocumentDeletedEvent,
  DocumentFailedEvent,
  DocumentPauseEvent,
  DocumentPausedEvent,
  DocumentProcessedEvent,
  DocumentProgressEvent,
  DocumentRenameDto,
  DocumentRetryDto,
  DocumentStatusUpdate,
  DocumentSummarizeCompletedEvent,
  DocumentSummarizeDto,
  DocumentSummarizeEvent,
  DocumentSummarizeFailedEvent,
  DocumentSummarizePauseEvent,
  DocumentSummarizePausedEvent,
  DocumentSummarizeProgressEvent,
  DocumentUploadedEvent,
  Mode,
  RAGQueryDto,
  RagSearchHit,
  SearchHit,
  SearchRequest,
  SearchResponse,
  Source,
} from '../generated/wire';

export type { WireRoutingKey } from '../generated/routing';

export { WIRE_ROUTING_KEY_LIST, WIRE_ROUTING_KEYS } from '../generated/routing';

export interface OcrLanguageOption {
  code: OcrLanguageCode;
  label: string;
}

export interface Document {
  id: string;
  title: string;
  /** Internal only — never return to clients from the gateway. */
  filePath?: string;
  fileExt?: string;
  status: DocumentStatus;
  errorReason?: string;
  progressStage?: DocumentProgressStage;
  progressDone?: number;
  progressTotal?: number;
  summarizeStatus?: SummarizeStatus | null;
  summarizeDone?: number;
  summarizeTotal?: number;
  summarizeError?: string;
  uploadedBy?: string;
  ocrLang?: OcrLanguageCode;
  ocrEngine?: OcrEngine;
  createdAt: string;
  updatedAt: string;
}

/** Client-safe document row (no filePath / timestamps required). */
export type DocumentSummary = Pick<
  Document,
  | 'id'
  | 'title'
  | 'fileExt'
  | 'status'
  | 'errorReason'
  | 'progressStage'
  | 'progressDone'
  | 'progressTotal'
  | 'summarizeStatus'
  | 'summarizeDone'
  | 'summarizeTotal'
  | 'summarizeError'
  | 'ocrLang'
  | 'ocrEngine'
> & {
  createdAt?: string;
};

export interface DocumentChunk {
  id?: number;
  documentId: string;
  chunkIndex: number;
  content: string;
  createdAt?: string;
}

export interface RAGResult {
  answer: string;
  sources: Source[];
  cacheHit?: boolean;
}

export interface Message {
  role: ChatRole;
  text: string;
  sources?: Source[];
}

export interface ConversationSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  documentIds?: string[];
}

export interface ConversationMessage extends Message {
  id: number;
  conversationId: string;
  createdAt: string;
}

export interface ChatDeepStatus {
  running: boolean;
  query?: string;
  done?: number;
  total?: number;
}

export interface SystemHealth {
  document_service: string;
  rag_worker: string;
  event_processor: string;
  redis: string;
  rabbitmq: string;
  postgres: string;
}

export interface MetricsSnapshot {
  cache: {
    hits: number;
    misses: number;
    hitRate: number | null;
  };
  queries: {
    last24h: number;
    avgLatencyMs: number | null;
    series: Array<{ hour: string; count: number; avgMs: number }>;
  };
  ingest: {
    processed24h: number;
    failed24h: number;
    avgExtractionMs: number | null;
    avgChunkingMs: number | null;
    avgEmbeddingMs: number | null;
  };
  documents: {
    uploading: number;
    processing: number;
    paused: number;
    ready: number;
    failed: number;
  };
  jobs: {
    completed24h: number;
    failed24h: number;
  };
  redis: {
    usedMemoryBytes: number | null;
  };
  /** Latest RabbitMQ depths from event-processor redis.stats snapshot. */
  queues: Record<string, number>;
}

export interface RuntimeConfigSetting {
  key: string;
  kind: ConfigValueKind;
  value: string;
  services: string[];
}

export interface RuntimeConfig {
  envFilePath: string;
  settings: RuntimeConfigSetting[];
}

export interface RuntimeConfigUpdate extends RuntimeConfig {
  changedKeys: string[];
  recreateServices: string[];
  command: string;
}
