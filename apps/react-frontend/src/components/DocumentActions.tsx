import { useEffect, useState } from 'react';
import {
  OCR_LANGUAGE_NEEDED,
  canChangeOcrLangLive,
  ocrLangSelectValue,
  showOcrLanguageMenu,
  type DocumentSummary,
  type OcrLanguageOption,
} from '@ragpolyglot-shared';
import { Button } from './Button';
import { useDocuments } from '../context/DocumentsProvider';
import { loadOcrLanguages } from '../lib/documents';

export function DocumentActions({
  doc,
  onDeleted,
}: {
  doc: DocumentSummary;
  onDeleted?: () => void;
}) {
  const { remove, retry, changeOcrLang, pause, resume } = useDocuments();
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [draftLang, setDraftLang] = useState<string | null>(null);
  const [ocrLanguages, setOcrLanguages] = useState<OcrLanguageOption[]>([]);

  const canRetry = doc.status === 'failed' || doc.status === 'ready';
  const canPause = doc.status === 'processing';
  const canResume = doc.status === 'paused';
  const canDelete = canRetry || canResume || canPause;
  const needsOcrLanguage = doc.errorReason === OCR_LANGUAGE_NEEDED;
  const showOcrLanguage = showOcrLanguageMenu(doc);
  const liveOcrLangChange = canChangeOcrLangLive(doc);
  const selectLang = ocrLangSelectValue(draftLang ?? doc.ocrLang, ocrLanguages);
  const appliedLang = ocrLangSelectValue(doc.ocrLang, ocrLanguages);
  const selectedInList =
    !selectLang || ocrLanguages.some((lang) => lang.code === selectLang);

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

  const onOcrLangChange = (value: string) => {
    setDraftLang(value);
    if (!liveOcrLangChange || value === appliedLang) return;
    void runAction(async () => {
      try {
        await changeOcrLang(doc.id, value || undefined);
      } finally {
        setDraftLang(null);
      }
    }, 'OCR language change failed');
  };

  if (!showOcrLanguage && !canDelete) {
    return null;
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {showOcrLanguage && (
          <select
            value={selectLang}
            onChange={(e) => onOcrLangChange(e.target.value)}
            disabled={
              pending || (doc.status === 'processing' && !liveOcrLangChange)
            }
            aria-label={`OCR language for ${doc.title}`}
            className="max-w-[11rem] rounded-lg border border-gray-700 bg-gray-950 px-2 py-1.5 text-xs text-gray-200"
          >
            <option value="">
              {needsOcrLanguage ? 'Select language' : 'Automatic'}
            </option>
            {!selectedInList && selectLang && (
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
            onClick={() => void runAction(() => pause(doc.id), 'Pause failed')}
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
              void runAction(async () => {
                await remove(doc.id);
                onDeleted?.();
              }, 'Delete failed')
            }
            disabled={pending}
            aria-label={`Delete ${doc.title}`}
          >
            {pending ? '…' : 'Delete'}
          </Button>
        )}
      </div>
      {actionError && <p className="text-xs text-red-400">{actionError}</p>}
    </div>
  );
}
