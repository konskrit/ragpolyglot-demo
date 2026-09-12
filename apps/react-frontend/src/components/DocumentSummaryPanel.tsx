import { useEffect, useState } from 'react';
import {
  formatErrorReason,
  formatSummarizeProgressLabel,
  isActiveSummarizeStatus,
  type DocumentSummary,
} from '@ragpolyglot-shared';
import { Button } from './Button';
import { PageSpinner } from './PageSpinner';
import { useDocuments } from '../context/DocumentsProvider';
import { loadDocumentSummary } from '../lib/documents';
import { subscribeDocument } from '../hooks/useWebSocket';

export function DocumentSummaryPanel({ doc }: { doc: DocumentSummary }) {
  const { startSummarize, pauseSummarize, resumeSummarize } = useDocuments();

  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const active = isActiveSummarizeStatus(doc.summarizeStatus);
  const progressLabel = formatSummarizeProgressLabel(doc);
  const failed = doc.summarizeStatus === 'failed';
  const displayError =
    error ||
    (failed && doc.summarizeError
      ? formatErrorReason(doc.summarizeError)
      : null);

  useEffect(() => {
    subscribeDocument(doc.id);
  }, [doc.id]);

  useEffect(() => {
    if (active) return;

    let cancelled = false;
    void loadDocumentSummary(doc.id)
      .then((text) => {
        if (!cancelled) setSummary(text);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load summary');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [doc.id, active, doc.summarizeStatus]);

  const run = async (action: () => Promise<unknown>, fallback: string) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : fallback);
    } finally {
      setBusy(false);
    }
  };

  if (!active && loading) return <PageSpinner />;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-400">
          Whole-document summary · runs in the background · saved for Agent
          search
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {doc.summarizeStatus === 'running' && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                void run(() => pauseSummarize(doc.id), 'Failed to pause')
              }
              disabled={busy}
            >
              Pause
            </Button>
          )}
          {doc.summarizeStatus === 'paused' && (
            <Button
              size="sm"
              onClick={() =>
                void run(() => resumeSummarize(doc.id), 'Failed to resume')
              }
              disabled={busy}
            >
              Resume
            </Button>
          )}
          {!active && (
            <Button
              size="sm"
              onClick={() =>
                void run(() => startSummarize(doc.id), 'Failed to start')
              }
              disabled={busy}
            >
              {failed ? 'Retry' : summary ? 'Regenerate' : 'Generate'}
            </Button>
          )}
        </div>
      </div>

      {progressLabel && (
        <p className="text-sm text-gray-400">{progressLabel}</p>
      )}
      {displayError && <p className="text-sm text-red-400">{displayError}</p>}

      {doc.summarizeStatus === 'running' ? (
        <p className="text-sm text-gray-500">Summarizing in the background…</p>
      ) : doc.summarizeStatus === 'paused' ? (
        <p className="text-sm text-gray-500">
          Paused — progress is saved. Resume to continue.
        </p>
      ) : summary ? (
        <div className="rounded-lg border border-gray-800 bg-gray-900 px-4 py-3 min-w-0">
          <p className="text-sm text-gray-200 whitespace-pre-wrap wrap-anywhere leading-relaxed">
            {summary}
          </p>
        </div>
      ) : (
        <p className="text-sm text-gray-500">No summary yet.</p>
      )}
    </section>
  );
}
