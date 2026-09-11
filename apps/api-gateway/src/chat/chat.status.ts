import {
  isDocumentProgressStage,
  type DocumentStatus,
  type DocumentStatusUpdate,
  type SummarizeStatus,
} from '@ragpolyglot-shared';

type StatusEvent = {
  type?: string;
  documentId?: string;
  stage?: string;
  done?: number;
  total?: number;
  errorReason?: string;
};

export type ParsedDocumentStatusEvent = {
  documentId: string;
  status?: DocumentStatus;
  progress?: Pick<
    DocumentStatusUpdate,
    'progressStage' | 'progressDone' | 'progressTotal'
  >;
  summarize?: Pick<
    DocumentStatusUpdate,
    'summarizeStatus' | 'summarizeDone' | 'summarizeTotal' | 'summarizeError'
  >;
};

export function parseDocumentStatusEvent(
  event: StatusEvent,
): ParsedDocumentStatusEvent | null {
  if (!event.documentId) return null;

  switch (event.type) {
    case 'document.processed':
      return { documentId: event.documentId, status: 'ready' };
    case 'document.failed':
      return { documentId: event.documentId, status: 'failed' };
    case 'document.paused':
      return { documentId: event.documentId, status: 'paused' };
    case 'document.progress':
      if (!isDocumentProgressStage(event.stage)) return null;
      return {
        documentId: event.documentId,
        status: 'processing',
        progress: {
          progressStage: event.stage,
          progressDone: event.done ?? 0,
          progressTotal: event.total ?? 0,
        },
      };
    case 'document.summarize.progress':
      return {
        documentId: event.documentId,
        summarize: {
          summarizeStatus: 'running' satisfies SummarizeStatus,
          summarizeDone: event.done ?? 0,
          summarizeTotal: event.total ?? 0,
          summarizeError: undefined,
        },
      };
    case 'document.summarize.completed':
      return {
        documentId: event.documentId,
        summarize: {
          summarizeStatus: null,
          summarizeDone: undefined,
          summarizeTotal: undefined,
          summarizeError: undefined,
        },
      };
    case 'document.summarize.failed':
      return {
        documentId: event.documentId,
        summarize: {
          summarizeStatus: 'failed',
          summarizeError: event.errorReason,
        },
      };
    case 'document.summarize.paused':
      return {
        documentId: event.documentId,
        summarize: {
          summarizeStatus: 'paused',
        },
      };
    default:
      return null;
  }
}
