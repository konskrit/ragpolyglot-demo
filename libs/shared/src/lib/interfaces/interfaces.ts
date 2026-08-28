import { DocumentStatus, ChatRole } from '../types/types';

export interface Document {
  id: string;
  title: string;
  /** Internal only — never return to clients from the gateway. */
  filePath?: string;
  status: DocumentStatus;
  errorReason?: string;
  uploadedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentChunk {
  id?: number;
  documentId: string;
  chunkIndex: number;
  content: string;
  createdAt?: string;
}

export interface DocumentUploadedEvent {
  type: 'document.uploaded';
  documentId: string;
  filePath: string;
  userId: string;
  timestamp: string;
}

export interface DocumentProcessedEvent {
  type: 'document.processed';
  documentId: string;
  chunkCount: number;
  timestamp: string;
}

export interface DocumentFailedEvent {
  type: 'document.failed';
  documentId: string;
  errorReason: string;
  timestamp: string;
}

export interface DocumentDeletedEvent {
  type: 'document.deleted';
  documentId: string;
  timestamp: string;
}

export interface DocumentCreateDto {
  title: string;
  filePath: string;
}

export interface RAGQueryDto {
  query: string;
  topK?: number;
  userId?: string;
}

export interface RagSearchHit {
  documentId: string;
  chunkIndex: number;
  content: string;
  similarity: number;
}

export interface Source {
  documentId: string;
  documentTitle: string;
  chunkContent: string;
  similarity: number;
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

export interface SystemHealth {
  document_service: string;
  rag_worker: string;
  event_processor: string;
  redis: string;
  rabbitmq: string;
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
}
