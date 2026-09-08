import type { RuntimeConfigSetting } from '@ragpolyglot-shared';
import { dirtyValues, groupByServices } from './runtime-config';

const sample: RuntimeConfigSetting[] = [
  {
    key: 'RAG_TOP_K',
    kind: 'int',
    value: '5',
    services: ['api-gateway'],
  },
  {
    key: 'OCR_INGEST_PREFETCH',
    kind: 'int',
    value: '2',
    services: ['rag-worker'],
  },
  {
    key: 'AUTO_RETRY_LIMIT',
    kind: 'int',
    value: '3',
    services: ['document-service', 'event-processor'],
  },
];

describe('runtime-config helpers', () => {
  it('dirtyValues returns only changed keys', () => {
    const saved = Object.fromEntries(sample.map((s) => [s.key, s.value]));
    expect(dirtyValues({ ...saved, RAG_TOP_K: '8' }, saved)).toEqual({
      RAG_TOP_K: '8',
    });
  });

  it('groupByServices sorts and joins service labels', () => {
    expect(groupByServices(sample).map((g) => g.label)).toEqual([
      'api-gateway',
      'document-service + event-processor',
      'rag-worker',
    ]);
  });
});
