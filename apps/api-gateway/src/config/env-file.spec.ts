import { mergeEnvFile, parseEnvAssignments } from './env-file';
import { recreateCommand } from './config-settings';

describe('env-file merge', () => {
  it('updates existing keys and preserves comments', () => {
    const input = [
      '# comment',
      'OCR_INGEST_PREFETCH=1',
      'KEEP_ME=yes',
      '',
    ].join('\n');

    const next = mergeEnvFile(input, new Map([['OCR_INGEST_PREFETCH', '2']]));
    const map = parseEnvAssignments(next);

    expect(next).toContain('# comment');
    expect(map.get('OCR_INGEST_PREFETCH')).toBe('2');
    expect(map.get('KEEP_ME')).toBe('yes');
  });

  it('appends missing allowlisted keys', () => {
    const next = mergeEnvFile('FOO=1\n', new Map([['RAG_TOP_K', '8']]));
    expect(parseEnvAssignments(next).get('RAG_TOP_K')).toBe('8');
    expect(next).toContain('# Updated via /api/config');
  });
});

describe('recreateCommand', () => {
  it('dedupes and sorts services', () => {
    expect(recreateCommand(['rag-worker', 'api-gateway', 'rag-worker'])).toBe(
      'docker compose up -d --force-recreate --no-deps api-gateway rag-worker',
    );
    expect(recreateCommand([])).toBe('');
  });
});
