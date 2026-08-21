import {
  CHAT_ROLES,
  DOCUMENT_STATUSES,
  UPLOAD_STATES,
  isDocumentStatus,
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
});
