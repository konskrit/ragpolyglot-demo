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
});
