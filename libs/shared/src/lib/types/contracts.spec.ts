import {
  CHAT_ROLES,
  DOCUMENT_PROGRESS_STAGES,
  DOCUMENT_STATUSES,
  ACTIVE_DOCUMENT_STATUSES,
  UPLOAD_STATES,
  documentEmbeddingProgressPercent,
  formatDocumentProgressLabel,
  formatErrorReason,
  OCR_LANGUAGE_NEEDED,
  conversationTitleFromQuery,
  isOcrLanguageCode,
  showOcrLanguageMenu,
  canChangeOcrLangLive,
  ocrLangSelectValue,
  isChatRole,
  parseRagSources,
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
      'paused',
      'ready',
      'failed',
    ]);
  });

  it('exposes upload and chat role unions', () => {
    expect(UPLOAD_STATES).toContain('success');
    expect(CHAT_ROLES).toEqual(['user', 'assistant']);
    expect(isChatRole('user')).toBe(true);
    expect(isChatRole('system')).toBe(false);
  });

  it('accepts tessdata OCR language codes', () => {
    expect(isOcrLanguageCode('eng')).toBe(true);
    expect(isOcrLanguageCode('chi_sim')).toBe(true);
    expect(isOcrLanguageCode('ancient_greek')).toBe(true);
    expect(isOcrLanguageCode('')).toBe(false);
    expect(isOcrLanguageCode('AUTO')).toBe(false);
  });

  it('shows the OCR language menu when language is needed or a PDF used OCR', () => {
    expect(showOcrLanguageMenu({ errorReason: OCR_LANGUAGE_NEEDED })).toBe(
      true,
    );
    expect(
      showOcrLanguageMenu({
        fileExt: 'pdf',
        status: 'processing',
      }),
    ).toBe(false);
    expect(
      showOcrLanguageMenu({
        fileExt: 'pdf',
        status: 'processing',
        progressStage: 'embedding',
      }),
    ).toBe(false);
    expect(
      showOcrLanguageMenu({
        fileExt: 'pdf',
        status: 'processing',
        progressStage: 'extracting',
      }),
    ).toBe(true);
    expect(
      showOcrLanguageMenu({
        fileExt: 'pdf',
        status: 'processing',
        progressStage: 'extracting',
        progressTotal: 10,
      }),
    ).toBe(true);
    expect(showOcrLanguageMenu({ fileExt: 'pdf', status: 'paused' })).toBe(
      false,
    );
    expect(
      showOcrLanguageMenu({
        fileExt: 'pdf',
        status: 'paused',
        progressStage: 'extracting',
      }),
    ).toBe(true);
    expect(
      showOcrLanguageMenu({
        fileExt: 'pdf',
        status: 'paused',
        progressStage: 'extracting',
        progressTotal: 10,
      }),
    ).toBe(true);
    expect(showOcrLanguageMenu({ fileExt: 'pdf', ocrLang: 'ell' })).toBe(true);
    expect(showOcrLanguageMenu({ fileExt: 'pdf' })).toBe(false);
    expect(showOcrLanguageMenu({ fileExt: 'txt', ocrLang: 'eng' })).toBe(false);
    expect(showOcrLanguageMenu({})).toBe(false);
  });

  it('allows live OCR language changes only while OCR is running or language is needed', () => {
    expect(
      canChangeOcrLangLive({
        fileExt: 'pdf',
        status: 'processing',
        progressStage: 'extracting',
      }),
    ).toBe(true);
    expect(
      canChangeOcrLangLive({
        fileExt: 'pdf',
        status: 'processing',
        progressStage: 'extracting',
        progressTotal: 10,
      }),
    ).toBe(true);
    expect(canChangeOcrLangLive({ fileExt: 'pdf', status: 'paused' })).toBe(
      false,
    );
    expect(
      canChangeOcrLangLive({
        fileExt: 'pdf',
        status: 'paused',
        progressStage: 'extracting',
      }),
    ).toBe(true);
    expect(
      canChangeOcrLangLive({
        fileExt: 'pdf',
        status: 'paused',
        progressStage: 'extracting',
        progressTotal: 10,
      }),
    ).toBe(true);
    expect(
      canChangeOcrLangLive({
        fileExt: 'pdf',
        status: 'failed',
        errorReason: OCR_LANGUAGE_NEEDED,
      }),
    ).toBe(true);
    expect(
      canChangeOcrLangLive({
        fileExt: 'pdf',
        status: 'processing',
        progressStage: 'embedding',
      }),
    ).toBe(false);
  });

  it('maps auto OCR packs to Automatic in the language select', () => {
    const options = [{ code: 'eng' }, { code: 'ell' }, { code: 'grc+ell' }];
    expect(ocrLangSelectValue('eng+fra+deu+ita+lat', options)).toBe('');
    expect(ocrLangSelectValue('rus+srp+bul', options)).toBe('');
    expect(ocrLangSelectValue('grc+ell', options)).toBe('grc+ell');
    expect(ocrLangSelectValue('ell', options)).toBe('ell');
    expect(ocrLangSelectValue('', options)).toBe('');
  });

  it('titles conversations from the first user query', () => {
    expect(conversationTitleFromQuery('  What is RAG?  ')).toBe('What is RAG?');
    expect(conversationTitleFromQuery('a'.repeat(61))).toBe(
      `${'a'.repeat(57)}…`,
    );
    expect(conversationTitleFromQuery('   ')).toBe('New chat');
  });

  it('parses RAG sources and drops malformed hits', () => {
    expect(parseRagSources(null)).toBeUndefined();
    expect(
      parseRagSources([
        {
          documentId: 'd1',
          documentTitle: 'Doc',
          chunkContent: 'hello',
          similarity: 0.9,
        },
        { documentId: 'bad' },
      ]),
    ).toEqual([
      {
        documentId: 'd1',
        documentTitle: 'Doc',
        chunkContent: 'hello',
        similarity: 0.9,
      },
    ]);
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
        progressStage: 'extracting',
        progressDone: 3,
        progressTotal: 10,
      }),
    ).toBe('OCR 3/10');
    expect(
      formatDocumentProgressLabel({
        status: 'paused',
        progressStage: 'extracting',
        progressDone: 3,
        progressTotal: 10,
      }),
    ).toBe('Paused · OCR 3/10');
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
    expect(formatErrorReason(OCR_LANGUAGE_NEEDED)).toBe(
      'Could not detect the OCR language. Choose a language and retry.',
    );
  });
});
