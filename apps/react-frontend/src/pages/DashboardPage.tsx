import { Link } from 'react-router-dom';
import { useDocuments } from '../context/DocumentsProvider';
import { usePolledJson } from '../hooks/usePolledJson';
import { HealthSection } from '../components/dashboard/HealthSection';
import { MetricsSection } from '../components/dashboard/MetricsSection';
import { DocumentsList } from '../components/dashboard/DocumentsList';
import type { MetricsSnapshot, SystemHealth } from '@ragpolyglot-shared';

export function DashboardPage() {
  const { data: health, error: healthError } =
    usePolledJson<SystemHealth>('/api/health');
  const { data: metrics, error: metricsError } =
    usePolledJson<MetricsSnapshot>('/api/metrics');
  const { documents, loading, error, remove, retry } = useDocuments();

  if (loading && documents.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-semibold mb-2">Dashboard</h1>
        <p className="text-gray-400">
          Health, performance, and recent documents.
        </p>
      </div>

      <HealthSection health={health} error={healthError} />
      <MetricsSection metrics={metrics} error={metricsError} />

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

      <DocumentsList
        documents={documents}
        listError={error}
        onRemove={remove}
        onRetry={retry}
      />
    </div>
  );
}
