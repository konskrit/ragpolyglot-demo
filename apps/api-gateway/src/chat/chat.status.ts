import {
  isDocumentProgressStage,
  type DocumentStatus,
  type DocumentStatusUpdate,
} from '@ragpolyglot-shared';

type StatusEvent = {
  type?: string;
  documentId?: string;
  stage?: string;
  done?: number;
  total?: number;
};

export function parseDocumentStatusEvent(event: StatusEvent): {
  documentId: string;
  status: DocumentStatus;
  progress?: Pick<
    DocumentStatusUpdate,
    'progressStage' | 'progressDone' | 'progressTotal'
  >;
} | null {
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
    default:
      return null;
  }
}
