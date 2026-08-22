import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getJson } from '../api/client';
import { useDocuments } from '../context/DocumentsProvider';
import { useWebSocketStatus } from '../hooks/useWebSocket';
import { StatusBadge } from '../components/StatusBadge';
import type { SystemHealth } from '@ragpolyglot-shared';

export function DashboardPage() {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const { documents, loading, error, remove } = useDocuments();
  const { connected: wsConnected } = useWebSocketStatus();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadHealth = useCallback(async () => {
    try {
      setHealthError(null);
      const data = await getJson<SystemHealth & { status?: string }>(
        '/api/health',
      );
      setHealth({
        document_service: data.document_service ?? 'unknown',
        rag_worker: data.rag_worker ?? 'unknown',
        redis: data.redis ?? 'unknown',
        rabbitmq: data.rabbitmq ?? 'unknown',
      });
    } catch (e) {
      setHealthError(e instanceof Error ? e.message : 'Health check failed');
    }
  }, []);

  useEffect(() => {
    void loadHealth();
    const interval = setInterval(() => void loadHealth(), 15_000);
    return () => clearInterval(interval);
  }, [loadHealth]);

  const onDelete = async (id: string) => {
    if (deletingId) return;
    setDeletingId(id);
    setDeleteError(null);
    try {
      await remove(id);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setDeletingId(null);
    }
  };

  if (loading && documents.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold mb-2">Dashboard</h1>
          <p className="text-gray-400">
            Overview of your RAG system and recent activity.
          </p>
        </div>
        <span
          className={`text-xs px-2 py-1 rounded-full border ${
            wsConnected
              ? 'border-green-500/30 text-green-400'
              : 'border-red-500/30 text-red-400'
          }`}
        >
          WS {wsConnected ? 'live' : 'offline'}
        </span>
      </div>

      {(health || healthError) && (
        <section>
          <h2 className="text-lg font-medium mb-4 text-gray-300">
            System Health
          </h2>
          {healthError && (
            <p className="text-sm text-red-400 mb-3">{healthError}</p>
          )}
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
      )}

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link
          to="/upload"
          className="p-6 bg-gray-900 rounded-xl border border-gray-800 hover:border-indigo-500 transition group"
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-medium text-white mb-1">
                Upload Documents
              </h3>
              <p className="text-sm text-gray-400">
                Add new files to your knowledge base
              </p>
            </div>
            <span className="text-indigo-500 group-hover:translate-x-1 transition-transform">
              →
            </span>
          </div>
        </Link>

        <Link
          to="/agent"
          className="p-6 bg-gray-900 rounded-xl border border-gray-800 hover:border-indigo-500 transition group"
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-medium text-white mb-1">
                Agent Mode
              </h3>
              <p className="text-sm text-gray-400">
                Chat with your documents using retrieval
              </p>
            </div>
            <span className="text-indigo-500 group-hover:translate-x-1 transition-transform">
              →
            </span>
          </div>
        </Link>
      </section>

      {error && (
        <p className="text-sm text-red-400">
          Failed to load documents: {error}
        </p>
      )}

      {deleteError && <p className="text-sm text-red-400">{deleteError}</p>}

      {documents.length > 0 ? (
        <section>
          <h2 className="text-lg font-medium mb-4 text-gray-300">
            Recent Documents
          </h2>
          <ul className="space-y-2">
            {documents.map((doc) => (
              <li
                key={doc.id}
                className="flex items-center justify-between bg-gray-900 rounded-lg px-4 py-3 border border-gray-800 gap-3"
              >
                <div className="flex-1 truncate mr-4">
                  <span className="text-white">{doc.title}</span>
                  {doc.createdAt && (
                    <span className="ml-2 text-xs text-gray-500">
                      {new Date(doc.createdAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <StatusBadge status={doc.status} />
                  <button
                    type="button"
                    onClick={() => void onDelete(doc.id)}
                    disabled={deletingId === doc.id}
                    className="text-xs text-gray-500 hover:text-red-400 disabled:opacity-40"
                    aria-label={`Delete ${doc.title}`}
                  >
                    {deletingId === doc.id ? '…' : 'Delete'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <div className="text-center py-12 bg-gray-900 rounded-xl border border-gray-800">
          <p className="text-gray-400 mb-4">No documents yet</p>
          <Link
            to="/upload"
            className="inline-block px-6 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-white font-medium transition"
          >
            Upload your first document
          </Link>
        </div>
      )}
    </div>
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
