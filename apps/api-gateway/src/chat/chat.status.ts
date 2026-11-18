import {
  isDocumentProgressStage,
  WIRE_ROUTING_KEYS,
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
    case WIRE_ROUTING_KEYS.Processed:
      return { documentId: event.documentId, status: 'ready' };
    case WIRE_ROUTING_KEYS.Failed:
      return { documentId: event.documentId, status: 'failed' };
    case WIRE_ROUTING_KEYS.Paused:
      return { documentId: event.documentId, status: 'paused' };
    case WIRE_ROUTING_KEYS.Progress:
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
    case WIRE_ROUTING_KEYS.SummarizeProgress:
      return {
        documentId: event.documentId,
        summarize: {
          summarizeStatus: 'running' satisfies SummarizeStatus,
          summarizeDone: event.done ?? 0,
          summarizeTotal: event.total ?? 0,
          summarizeError: undefined,
        },
      };
    case WIRE_ROUTING_KEYS.SummarizeCompleted:
      return {
        documentId: event.documentId,
        summarize: {
          summarizeStatus: null,
          summarizeDone: undefined,
          summarizeTotal: undefined,
          summarizeError: undefined,
        },
      };
    case WIRE_ROUTING_KEYS.SummarizeFailed:
      return {
        documentId: event.documentId,
        summarize: {
          summarizeStatus: 'failed',
          summarizeError: event.errorReason,
        },
      };
    case WIRE_ROUTING_KEYS.SummarizePaused:
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
