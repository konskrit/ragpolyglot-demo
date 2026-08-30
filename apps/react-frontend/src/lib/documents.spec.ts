import { mapApiDocuments } from './documents';
import { formatSimilarityPercent } from './formatSimilarity';

jest.mock('../config', () => ({
  API_BASE_URL: '',
}));

describe('mapApiDocuments', () => {
  it('returns empty array for non-arrays', () => {
    expect(mapApiDocuments(null)).toEqual([]);
    expect(mapApiDocuments({})).toEqual([]);
  });

  it('maps and normalizes statuses', () => {
    expect(
      mapApiDocuments([
        { id: '1', title: 'A', status: 'Ready' },
        { id: '2', title: 'B', status: 'processing' },
        { id: '3', title: 'C', status: 'nope' },
      ]),
    ).toEqual([
      { id: '1', title: 'A', status: 'ready', createdAt: undefined },
      { id: '2', title: 'B', status: 'processing', createdAt: undefined },
      { id: '3', title: 'C', status: 'uploading', createdAt: undefined },
    ]);
  });

  it('skips malformed rows', () => {
    expect(
      mapApiDocuments([
        { id: '1' },
        { title: 'x' },
        { id: '2', title: 'ok', status: 'ready' },
      ]),
    ).toEqual([
      { id: '2', title: 'ok', status: 'ready', createdAt: undefined },
    ]);
  });

  it('maps progress fields and ignores invalid stages', () => {
    expect(
      mapApiDocuments([
        {
          id: '1',
          title: 'A',
          status: 'processing',
          progressStage: 'embedding',
          progressDone: 2,
          progressTotal: 5,
          createdAt: '2026-01-01T00:00:00Z',
        },
        {
          id: '2',
          title: 'B',
          status: 'processing',
          progressStage: 'chunking',
        },
      ]),
    ).toEqual([
      {
        id: '1',
        title: 'A',
        status: 'processing',
        progressStage: 'embedding',
        progressDone: 2,
        progressTotal: 5,
        createdAt: '2026-01-01T00:00:00Z',
      },
      {
        id: '2',
        title: 'B',
        status: 'processing',
        createdAt: undefined,
      },
    ]);
  });
});

describe('formatSimilarityPercent', () => {
  it('formats 0-1 scores as percent', () => {
    expect(formatSimilarityPercent(0.876)).toBe('87.6%');
  });

  it('passes through values already in percent scale', () => {
    expect(formatSimilarityPercent(87.6)).toBe('87.6%');
  });

  it('handles invalid numbers', () => {
    expect(formatSimilarityPercent(Number.NaN)).toBe('—');
  });
});
