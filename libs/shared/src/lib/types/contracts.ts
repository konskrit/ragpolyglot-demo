import type { DocumentSummary, Source } from '../interfaces/interfaces';
import type {
  DocumentProgressStage,
  DocumentStatus,
  UploadState,
  ChatRole,
} from './types';

export const DOCUMENT_STATUSES = [
  'uploading',
  'processing',
  'ready',
  'failed',
] as const satisfies readonly DocumentStatus[];

export const ACTIVE_DOCUMENT_STATUSES = [
  'uploading',
  'processing',
] as const satisfies readonly DocumentStatus[];

export const DOCUMENT_PROGRESS_STAGES = [
  'extracting',
  'embedding',
] as const satisfies readonly DocumentProgressStage[];

export const UPLOAD_STATES = [
  'idle',
  'uploading',
  'success',
  'error',
] as const satisfies readonly UploadState[];

export const CHAT_ROLES = [
  'user',
  'assistant',
] as const satisfies readonly ChatRole[];

export function isChatRole(value: unknown): value is ChatRole {
  return (
    typeof value === 'string' &&
    (CHAT_ROLES as readonly string[]).includes(value)
  );
}

export function parseRagSources(value: unknown): Source[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const sources: Source[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    if (
      typeof row.documentId !== 'string' ||
      typeof row.documentTitle !== 'string' ||
      typeof row.chunkContent !== 'string' ||
      typeof row.similarity !== 'number'
    ) {
      continue;
    }
    sources.push({
      documentId: row.documentId,
      documentTitle: row.documentTitle,
      chunkContent: row.chunkContent,
      similarity: row.similarity,
    });
  }
  return sources.length > 0 ? sources : undefined;
}

export function conversationTitleFromQuery(query: string): string {
  const title = query.replace(/\s+/g, ' ').trim();
  if (!title) return 'New chat';
  return title.length <= 60 ? title : `${title.slice(0, 57)}…`;
}

export function isDocumentStatus(value: unknown): value is DocumentStatus {
  return (
    typeof value === 'string' &&
    (DOCUMENT_STATUSES as readonly string[]).includes(value)
  );
}

export function normalizeDocumentStatus(
  status: unknown,
): DocumentStatus | null {
  const normalized = String(status ?? '').toLowerCase();
  return isDocumentStatus(normalized) ? normalized : null;
}

export function isActiveDocumentStatus(status: DocumentStatus): boolean {
  return (ACTIVE_DOCUMENT_STATUSES as readonly string[]).includes(status);
}

export function isDocumentProgressStage(
  value: unknown,
): value is DocumentProgressStage {
  return (
    typeof value === 'string' &&
    (DOCUMENT_PROGRESS_STAGES as readonly string[]).includes(value)
  );
}

export function formatErrorReason(reason: string): string {
  return reason.replace(/_/g, ' ');
}

type DocumentProgressView = Pick<
  DocumentSummary,
  'status' | 'progressStage' | 'progressDone' | 'progressTotal'
>;

export function formatDocumentProgressLabel(
  doc: DocumentProgressView,
): string | null {
  if (doc.status !== 'processing') return null;
  if (doc.progressStage === 'extracting') return 'Extracting text…';
  const total = doc.progressTotal ?? 0;
  if (doc.progressStage === 'embedding' && total > 0) {
    return `Embedding chunks ${doc.progressDone ?? 0}/${total}`;
  }
  return null;
}

export function documentEmbeddingProgressPercent(
  doc: DocumentProgressView,
): number | null {
  const total = doc.progressTotal ?? 0;
  if (doc.progressStage !== 'embedding' || total <= 0) return null;
  return Math.min(100, Math.round(((doc.progressDone ?? 0) / total) * 100));
}
