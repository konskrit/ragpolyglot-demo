import { formatDuration } from '../../lib/formatDuration';
import type { MetricsSnapshot } from '@ragpolyglot-shared';

export function MetricsSection({
  metrics,
  error,
}: {
  metrics: MetricsSnapshot | null;
  error: string | null;
}) {
  return (
    <section>
      <h2 className="text-lg font-medium mb-4 text-gray-300">
        Performance (24h)
      </h2>
      {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
      {metrics && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            <MetricCard
              label="Cache hit rate"
              value={
                metrics.cache.hitRate == null
                  ? '—'
                  : `${metrics.cache.hitRate}%`
              }
              hint={`${metrics.cache.hits} hits / ${metrics.cache.misses} misses`}
            />
            <MetricCard
              label="RAG queries"
              value={String(metrics.queries.last24h)}
              hint={
                metrics.queries.avgLatencyMs == null
                  ? 'avg latency —'
                  : `avg ${formatDuration(metrics.queries.avgLatencyMs)}`
              }
            />
            <MetricCard
              label="Docs processed"
              value={String(metrics.ingest.processed24h)}
              hint={`${metrics.ingest.failed24h} failed`}
            />
            <MetricCard
              label="Documents"
              value={String(metrics.documents.ready)}
              hint={`${metrics.documents.failed} failed · ${metrics.documents.paused} paused · ${metrics.documents.uploading + metrics.documents.processing} in flight`}
            />
            <MetricCard
              label="Queue depth"
              value={String(
                metrics.queues.documentUploaded + metrics.queues.gatewayStatus,
              )}
              hint={`upload ${metrics.queues.documentUploaded} · status ${metrics.queues.gatewayStatus} · jobs ${metrics.queues.backgroundJobs}`}
            />
            <MetricCard
              label="Background jobs"
              value={String(metrics.jobs.completed24h)}
              hint={`${metrics.jobs.failed24h} failed`}
            />
            <MetricCard
              label="Redis memory"
              value={formatBytes(metrics.redis.usedMemoryBytes)}
              hint="latest snapshot"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <LatencyChart series={metrics.queries.series} />
            <IngestTiming
              chunkingMs={metrics.ingest.avgChunkingMs}
              embeddingMs={metrics.ingest.avgEmbeddingMs}
            />
          </div>
        </>
      )}
    </section>
  );
}

function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="p-4 rounded-lg border border-gray-800 bg-gray-900">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-2xl font-semibold text-white tabular-nums">{value}</p>
      <p className="text-xs text-gray-500 mt-1">{hint}</p>
    </div>
  );
}

function formatBytes(bytes: number | null): string {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function LatencyChart({
  series,
}: {
  series: MetricsSnapshot['queries']['series'];
}) {
  const max = Math.max(1, ...series.map((s) => s.avgMs));

  return (
    <div className="p-4 rounded-lg border border-gray-800 bg-gray-900">
      <p className="text-sm text-gray-300 mb-3">Query latency by hour (avg)</p>
      {series.length === 0 ? (
        <p className="text-sm text-gray-500 py-8 text-center">
          No queries in the last 24h
        </p>
      ) : (
        <div className="flex items-end gap-1 h-32">
          {series.map((point) => (
            <div
              key={point.hour}
              className="flex-1 flex flex-col items-center justify-end h-full min-w-0"
              title={`${new Date(point.hour).toLocaleString()}: ${formatDuration(point.avgMs)} (${point.count} queries)`}
            >
              <div
                className="w-full bg-indigo-500/80 rounded-t"
                style={{
                  height: `${Math.max(4, (point.avgMs / max) * 100)}%`,
                }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function IngestTiming({
  chunkingMs,
  embeddingMs,
}: {
  chunkingMs: number | null;
  embeddingMs: number | null;
}) {
  const rows = [
    { label: 'Chunking', ms: chunkingMs },
    { label: 'Embedding', ms: embeddingMs },
  ];
  const max = Math.max(1, ...rows.map((r) => r.ms ?? 0));

  return (
    <div className="p-4 rounded-lg border border-gray-800 bg-gray-900">
      <p className="text-sm text-gray-300 mb-3">
        Avg ingest timing (processed docs)
      </p>
      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.label}>
            <div className="flex justify-between text-xs text-gray-400 mb-1">
              <span>{row.label}</span>
              <span className="tabular-nums">{formatDuration(row.ms)}</span>
            </div>
            <div className="h-2 bg-gray-800 rounded overflow-hidden">
              <div
                className="h-full bg-indigo-500/70 rounded"
                style={{
                  width: row.ms == null ? '0%' : `${(row.ms / max) * 100}%`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
