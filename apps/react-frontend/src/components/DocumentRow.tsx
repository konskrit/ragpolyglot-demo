import { useEffect, useState } from 'react';
import {
  OCR_LANGUAGE_NEEDED,
  documentEmbeddingProgressPercent,
  formatDocumentProgressLabel,
  formatErrorReason,
  ocrLangSelectValue,
  showOcrLanguageMenu,
  type DocumentSummary,
  type OcrLanguageOption,
} from '@ragpolyglot-shared';
import { StatusBadge } from './StatusBadge';
import { Button } from './Button';
import { useDocuments } from '../context/DocumentsProvider';
import { loadOcrLanguages } from '../lib/documents';

export function DocumentRow({
  doc,
  showDate = false,
}: {
  doc: DocumentSummary;
  showDate?: boolean;
}) {
  const { remove, retry, pause, resume } = useDocuments();
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [ocrLang, setOcrLang] = useState(doc.ocrLang ?? '');
  const [ocrLanguages, setOcrLanguages] = useState<OcrLanguageOption[]>([]);

  const canRetry = doc.status === 'failed' || doc.status === 'ready';
  const canPause = doc.status === 'processing';
  const canResume = doc.status === 'paused';
  const canDelete = canRetry || canResume;
  const needsOcrLanguage = doc.errorReason === OCR_LANGUAGE_NEEDED;
  const showOcrLanguage = canRetry && showOcrLanguageMenu(doc);

  useEffect(() => {
    setOcrLang(doc.ocrLang ?? '');
  }, [doc.id, doc.ocrLang]);

  useEffect(() => {
    if (!showOcrLanguage) return;
    let cancelled = false;
    let attempt = 0;
    let timer: number | undefined;
    const maxAttempts = 3;

    const load = () => {
      void loadOcrLanguages().then((langs) => {
        if (cancelled) return;
        setOcrLanguages(langs);
        if (langs.length === 0 && attempt < maxAttempts) {
          attempt += 1;
          timer = window.setTimeout(load, 1000 * attempt);
        }
      });
    };
    load();

    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [showOcrLanguage]);

  const runAction = async (
    action: () => Promise<void>,
    fallbackMessage: string,
  ) => {
    if (pending) return;
    setPending(true);
    setActionError(null);
    try {
      await action();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : fallbackMessage);
    } finally {
      setPending(false);
    }
  };

  const progressLabel = formatDocumentProgressLabel(doc);
  const progressPct = documentEmbeddingProgressPercent(doc);
  const selectLang = ocrLangSelectValue(ocrLang, ocrLanguages);
  const selectedInList =
    !selectLang || ocrLanguages.some((lang) => lang.code === selectLang);

  return (
    <li className="flex flex-col bg-gray-900 rounded-lg px-4 py-3 border border-gray-800 gap-1">
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 truncate mr-4 min-w-0">
          <span className="text-white">{doc.title}</span>
          {showDate && doc.createdAt && (
            <span className="ml-2 text-xs text-gray-500">
              {new Date(doc.createdAt).toLocaleDateString()}
            </span>
          )}
          {doc.status === 'failed' && doc.errorReason && (
            <p className="text-xs text-red-400/80 mt-0.5 truncate">
              {formatErrorReason(doc.errorReason)}
            </p>
          )}
          {progressLabel && (
            <p className="text-xs text-gray-400 mt-0.5">{progressLabel}</p>
          )}
          {progressPct !== null && (
            <div className="mt-1.5 h-1 w-full max-w-xs rounded-full bg-gray-800 overflow-hidden">
              <div
                className="h-full bg-yellow-500/70 transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <StatusBadge status={doc.status} />
          {showOcrLanguage && (
            <select
              value={selectLang}
              onChange={(e) => setOcrLang(e.target.value)}
              disabled={pending}
              aria-label={`OCR language for ${doc.title}`}
              className="max-w-[11rem] rounded-lg border border-gray-700 bg-gray-950 px-2 py-1.5 text-xs text-gray-200"
            >
              <option value="">
                {needsOcrLanguage ? 'Select language' : 'Automatic'}
              </option>
              {!selectedInList && (
                <option value={selectLang}>{selectLang}</option>
              )}
              {ocrLanguages.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.label}
                </option>
              ))}
            </select>
          )}
          {canPause && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                void runAction(() => pause(doc.id), 'Pause failed')
              }
              disabled={pending}
              aria-label={`Pause ${doc.title}`}
            >
              {pending ? '…' : 'Pause'}
            </Button>
          )}
          {canResume && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                void runAction(() => resume(doc.id), 'Resume failed')
              }
              disabled={pending}
              aria-label={`Resume ${doc.title}`}
            >
              {pending ? '…' : 'Resume'}
            </Button>
          )}
          {canRetry && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                void runAction(
                  () =>
                    retry(
                      doc.id,
                      showOcrLanguage ? selectLang || undefined : undefined,
                    ),
                  'Retry failed',
                )
              }
              disabled={pending || (needsOcrLanguage && !selectLang)}
              aria-label={`Retry ${doc.title}`}
            >
              {pending ? '…' : 'Retry'}
            </Button>
          )}
          {canDelete && (
            <Button
              variant="danger"
              size="sm"
              onClick={() =>
                void runAction(() => remove(doc.id), 'Delete failed')
              }
              disabled={pending}
              aria-label={`Delete ${doc.title}`}
            >
              {pending ? '…' : 'Delete'}
            </Button>
          )}
        </div>
      </div>
      {actionError && <p className="text-xs text-red-400">{actionError}</p>}
    </li>
  );
}
