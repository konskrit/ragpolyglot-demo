import { parseDocumentStatusEvent } from './chat.status';

describe('parseDocumentStatusEvent', () => {
  it('maps known event types and ignores the rest', () => {
    expect(
      parseDocumentStatusEvent({ type: 'document.processed', documentId: '1' }),
    ).toEqual({ documentId: '1', status: 'ready' });
    expect(
      parseDocumentStatusEvent({
        type: 'document.progress',
        documentId: '1',
        stage: 'waiting_for_ocr',
        done: 192,
        total: 624,
      }),
    ).toEqual({
      documentId: '1',
      status: 'processing',
      progress: {
        progressStage: 'waiting_for_ocr',
        progressDone: 192,
        progressTotal: 624,
      },
    });
    expect(
      parseDocumentStatusEvent({
        type: 'document.progress',
        documentId: '1',
        stage: 'embedding',
        done: 2,
        total: 4,
      }),
    ).toEqual({
      documentId: '1',
      status: 'processing',
      progress: {
        progressStage: 'embedding',
        progressDone: 2,
        progressTotal: 4,
      },
    });
    expect(
      parseDocumentStatusEvent({ type: 'document.progress', documentId: '1' }),
    ).toBeNull();
    expect(parseDocumentStatusEvent({ type: 'document.processed' })).toBeNull();
  });

  it('maps summarize events without forcing document status', () => {
    expect(
      parseDocumentStatusEvent({
        type: 'document.summarize.progress',
        documentId: '1',
        done: 2,
        total: 5,
      }),
    ).toEqual({
      documentId: '1',
      summarize: {
        summarizeStatus: 'running',
        summarizeDone: 2,
        summarizeTotal: 5,
        summarizeError: undefined,
      },
    });
    expect(
      parseDocumentStatusEvent({
        type: 'document.summarize.completed',
        documentId: '1',
      }),
    ).toEqual({
      documentId: '1',
      summarize: {
        summarizeStatus: null,
        summarizeDone: undefined,
        summarizeTotal: undefined,
        summarizeError: undefined,
      },
    });
    expect(
      parseDocumentStatusEvent({
        type: 'document.summarize.failed',
        documentId: '1',
        errorReason: 'llm_error',
      }),
    ).toEqual({
      documentId: '1',
      summarize: {
        summarizeStatus: 'failed',
        summarizeError: 'llm_error',
      },
    });
    expect(
      parseDocumentStatusEvent({
        type: 'document.summarize.paused',
        documentId: '1',
      }),
    ).toEqual({
      documentId: '1',
      summarize: { summarizeStatus: 'paused' },
    });
  });
});
