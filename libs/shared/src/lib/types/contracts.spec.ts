import {
  CHAT_ROLES,
  DOCUMENT_PROGRESS_STAGES,
  DOCUMENT_STATUSES,
  ACTIVE_DOCUMENT_STATUSES,
  UPLOAD_STATES,
  documentEmbeddingProgressPercent,
  formatDocumentProgressLabel,
  formatErrorReason,
  isDocumentProgressStage,
  isDocumentStatus,
  isActiveDocumentStatus,
  normalizeDocumentStatus,
} from './contracts';

describe('shared contracts', () => {
  it('keeps document statuses aligned with the RAG pipeline', () => {
    expect(DOCUMENT_STATUSES).toEqual([
      'uploading',
      'processing',
      'ready',
      'failed',
    ]);
  });

  it('exposes upload and chat role unions', () => {
    expect(UPLOAD_STATES).toContain('success');
    expect(CHAT_ROLES).toEqual(['user', 'assistant']);
  });

  it('type-guards exact camelCase statuses', () => {
    expect(isDocumentStatus('ready')).toBe(true);
    expect(isDocumentStatus('Ready')).toBe(false);
    expect(isDocumentStatus(null)).toBe(false);
  });

  it('normalizes PascalCase and lowercase statuses', () => {
    expect(normalizeDocumentStatus('ready')).toBe('ready');
    expect(normalizeDocumentStatus('Ready')).toBe('ready');
    expect(normalizeDocumentStatus('Processing')).toBe('processing');
    expect(normalizeDocumentStatus('queued')).toBeNull();
    expect(normalizeDocumentStatus(null)).toBeNull();
  });

  it('tracks active document statuses', () => {
    expect(ACTIVE_DOCUMENT_STATUSES).toEqual(['uploading', 'processing']);
    expect(isActiveDocumentStatus('processing')).toBe(true);
    expect(isActiveDocumentStatus('ready')).toBe(false);
  });

  it('validates progress stages from the RAG worker', () => {
    expect(DOCUMENT_PROGRESS_STAGES).toEqual(['extracting', 'embedding']);
    expect(isDocumentProgressStage('extracting')).toBe(true);
    expect(isDocumentProgressStage('chunking')).toBe(false);
  });

  it('formats progress labels and embedding percent', () => {
    expect(
      formatDocumentProgressLabel({
        status: 'processing',
        progressStage: 'extracting',
      }),
    ).toBe('Extracting text…');
    expect(
      formatDocumentProgressLabel({
        status: 'processing',
        progressStage: 'embedding',
        progressDone: 2,
        progressTotal: 5,
      }),
    ).toBe('Embedding chunks 2/5');
    expect(
      documentEmbeddingProgressPercent({
        status: 'processing',
        progressStage: 'embedding',
        progressDone: 1,
        progressTotal: 4,
      }),
    ).toBe(25);
  });

  it('formats snake_case error reasons for display', () => {
    expect(formatErrorReason('embedding_error')).toBe('embedding error');
  });
});
