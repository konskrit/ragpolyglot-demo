import {
  ChatRole,
  ConfigValueKind,
  DocumentProgressStage,
  DocumentStatus,
  OcrEngine,
  OcrLanguageCode,
  SummarizeStatus,
} from '../types/types';

export type {
  ChatRequest,
  ChatResponse,
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
  DocumentSummarizeCompletedEvent,
  DocumentSummarizeDto,
  DocumentSummarizeEvent,
  DocumentSummarizeFailedEvent,
  DocumentSummarizePauseEvent,
  DocumentSummarizePausedEvent,
  DocumentSummarizeProgressEvent,
  DocumentUploadedEvent,
  RagSearchHit,
  SearchHit,
  SearchRequest,
  SearchResponse,
} from '../generated/wire';

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

export interface DocumentStatusUpdate {
  documentId: string;
  /** Omitted for summarize-only progress updates. */
  status?: DocumentStatus;
  timestamp?: string;
  progressStage?: DocumentProgressStage;
  progressDone?: number;
  progressTotal?: number;
  summarizeStatus?: SummarizeStatus | null;
  summarizeDone?: number;
  summarizeTotal?: number;
  summarizeError?: string;
}

export interface DocumentChunk {
  id?: number;
  documentId: string;
  chunkIndex: number;
  content: string;
  createdAt?: string;
}

export interface RAGQueryDto {
  query: string;
  topK?: number;
  mode?: 'fast' | 'deep';
  userId?: string;
  documentIds?: string[];
}

export interface Source {
  documentId: string;
  documentTitle: string;
  chunkContent: string;
  similarity: number;
  chunkIndex?: number;
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

export interface ChatCompletePayload {
  conversationId: string;
  sources?: Source[];
  error?: boolean;
  interrupted?: boolean;
  cacheHit?: boolean;
}

export interface ChatProgressPayload {
  conversationId: string;
  done: number;
  total: number;
}

export interface ChatStartedPayload {
  conversationId: string;
  mode: 'fast' | 'deep';
  query: string;
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
