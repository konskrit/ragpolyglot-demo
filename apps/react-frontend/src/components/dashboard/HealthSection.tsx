import type { SystemHealth } from '@ragpolyglot-shared';

export function HealthSection({
  health,
  error,
}: {
  health: SystemHealth | null;
  error: string | null;
}) {
  if (!health && !error) return null;

  return (
    <section>
      <h2 className="text-lg font-medium mb-4 text-gray-300">System Health</h2>
      {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
      {health && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <HealthCard
            label="Document Service"
            status={health.document_service}
          />
          <HealthCard label="RAG Worker" status={health.rag_worker} />
          <HealthCard label="Redis" status={health.redis} />
          <HealthCard label="RabbitMQ" status={health.rabbitmq} />
        </div>
      )}
    </section>
  );
}

function HealthCard({ label, status }: { label: string; status?: string }) {
  const ok = status === 'ok';
  return (
    <div
      className={`p-4 rounded-lg border ${
        ok
          ? 'border-green-500/30 bg-green-500/10'
          : 'border-red-500/30 bg-red-500/10'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-gray-300">{label}</span>
        <span
          className={`w-2 h-2 rounded-full ${ok ? 'bg-green-400' : 'bg-red-400'}`}
        />
      </div>
    </div>
  );
}
