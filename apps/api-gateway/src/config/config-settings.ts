import type { ConfigValueKind } from '@ragpolyglot-shared';

export type ConfigSetting = {
  key: string;
  kind: ConfigValueKind;
  /** Compose services to recreate when this key changes. */
  services: readonly string[];
};

/** Operator knobs safe to edit via UI — not secrets, ports, or build-time flags. */
export const CONFIG_SETTINGS: readonly ConfigSetting[] = [
  {
    key: 'FAST_INGEST_PREFETCH',
    kind: 'int',
    services: ['rag-worker'],
  },
  {
    key: 'OCR_INGEST_PREFETCH',
    kind: 'int',
    services: ['rag-worker'],
  },
  {
    key: 'OCR_POOL_SLOTS',
    kind: 'int',
    services: ['rag-worker'],
  },
  {
    key: 'EMBED_POOL_SLOTS',
    kind: 'int',
    services: ['rag-worker'],
  },
  {
    key: 'WORK_MEMORY_BUDGET_MB',
    kind: 'int',
    services: ['rag-worker'],
  },
  {
    key: 'EMBED_MEMORY_BUDGET_MB',
    kind: 'int',
    services: ['rag-worker'],
  },
  {
    key: 'OCR_PAGE_MEMORY_MB',
    kind: 'int',
    services: ['rag-worker'],
  },
  {
    key: 'EMBED_BATCH_MEMORY_MB',
    kind: 'int',
    services: ['rag-worker'],
  },
  {
    key: 'OCR_RENDER_DPI',
    kind: 'int',
    services: ['rag-worker'],
  },
  {
    key: 'KRAKEN_DEVICE',
    kind: 'string',
    services: ['rag-worker'],
  },
  {
    key: 'KRAKEN_GPU_CONCURRENT',
    kind: 'int',
    services: ['rag-worker'],
  },
  {
    key: 'KRAKEN_BATCH_PAGES',
    kind: 'int',
    services: ['rag-worker'],
  },
  {
    key: 'KRAKEN_THREADS',
    kind: 'int',
    services: ['rag-worker'],
  },
  {
    key: 'KRAKEN_PRECISION',
    kind: 'string',
    services: ['rag-worker'],
  },
  {
    key: 'KRAKEN_LINE_BATCH',
    kind: 'int',
    services: ['rag-worker'],
  },
  {
    key: 'KRAKEN_LINE_WORKERS',
    kind: 'int',
    services: ['rag-worker'],
  },
  {
    key: 'KRAKEN_VRAM_BUDGET_MB',
    kind: 'int',
    services: ['rag-worker'],
  },
  {
    key: 'KRAKEN_VRAM_PAGE_MB',
    kind: 'int',
    services: ['rag-worker'],
  },
  {
    key: 'KRAKEN_PAGE_MEMORY_MB',
    kind: 'int',
    services: ['rag-worker'],
  },
  {
    key: 'EMBEDDING_FALLBACK',
    kind: 'bool',
    services: ['rag-worker'],
  },
  {
    key: 'EMBEDDING_MODEL',
    kind: 'string',
    services: ['rag-worker'],
  },
  {
    key: 'MAX_EXTRACTED_CHARS',
    kind: 'int',
    services: ['rag-worker'],
  },
  {
    key: 'MAX_CHUNKS',
    kind: 'int',
    services: ['rag-worker'],
  },
  {
    key: 'LMSTUDIO_API_URL',
    kind: 'string',
    services: ['rag-worker'],
  },
  {
    key: 'LLM_MODEL',
    kind: 'string',
    services: ['rag-worker'],
  },
  {
    key: 'LLM_HTTP_TIMEOUT_SECONDS',
    kind: 'int',
    services: ['rag-worker'],
  },
  {
    key: 'RAG_SUMMARY_CONTEXT_CHARS',
    kind: 'int',
    services: ['rag-worker'],
  },
  {
    key: 'RAG_CHAT_TOP_K',
    kind: 'int',
    services: ['api-gateway', 'rag-worker'],
  },
  {
    key: 'RAG_CHAT_MAP_CONTEXT_CHARS',
    kind: 'int',
    services: ['rag-worker'],
  },
  {
    key: 'HTTP_TIMEOUT_MS',
    kind: 'int',
    services: ['api-gateway'],
  },
  {
    key: 'RAG_CACHE_TTL_SECONDS',
    kind: 'int',
    services: ['api-gateway'],
  },
  {
    key: 'RAG_TOP_K',
    kind: 'int',
    services: ['api-gateway', 'rag-worker'],
  },
  {
    key: 'MAX_UPLOAD_BYTES',
    kind: 'int',
    services: ['api-gateway'],
  },
  {
    key: 'AUTO_RETRY_INTERVAL_MINUTES',
    kind: 'int',
    services: ['event-processor'],
  },
  {
    key: 'AUTO_RETRY_MIN_AGE_MINUTES',
    kind: 'int',
    services: ['document-service', 'event-processor'],
  },
  {
    key: 'AUTO_RETRY_MAX_RETRIES',
    kind: 'int',
    services: ['document-service', 'event-processor'],
  },
  {
    key: 'AUTO_RETRY_LIMIT',
    kind: 'int',
    services: ['document-service', 'event-processor'],
  },
  {
    key: 'LOG_RETENTION_DAYS',
    kind: 'int',
    services: ['event-processor'],
  },
] as const;

export const CONFIG_SETTING_BY_KEY = new Map(
  CONFIG_SETTINGS.map((s) => [s.key, s]),
);

export function recreateCommand(services: readonly string[]): string {
  const unique = [...new Set(services)].sort();
  if (unique.length === 0) {
    return '';
  }
  return `docker compose up -d --force-recreate --no-deps ${unique.join(' ')}`;
}
