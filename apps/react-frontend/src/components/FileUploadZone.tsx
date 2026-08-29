import { useState, useRef, useEffect } from 'react';
import { ApiError, postFormData } from '../api/client';
import { subscribeDocument } from '../hooks/useWebSocket';
import { useDocuments } from '../context/DocumentsProvider';
import { Button } from './Button';
import type { UploadState } from '@ragpolyglot-shared';

export function FileUploadZone() {
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const successResetRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  useEffect(
    () => () => {
      if (successResetRef.current) {
        clearTimeout(successResetRef.current);
      }
    },
    [],
  );

  const { refresh } = useDocuments();

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = Array.from(e.dataTransfer.files);
    if (dropped.length > 0) {
      setFiles((prev) => [...prev, ...dropped]);
      setErrorMessage(null);
    }
  };

  const onSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = '';
    if (selected.length > 0) {
      setFiles((prev) => [...prev, ...selected]);
      setErrorMessage(null);
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const upload = async () => {
    if (files.length === 0 || uploadState === 'uploading') return;
    setUploadState('uploading');
    setErrorMessage(null);

    let successCount = 0;
    const failedFiles: string[] = [];

    for (const file of files) {
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('title', file.name);

        const doc = await postFormData<{ id: string }>(
          '/api/documents/upload',
          formData,
        );
        if (doc?.id) {
          subscribeDocument(doc.id);
        }
        successCount++;
      } catch (e) {
        const detail =
          e instanceof ApiError ? e.message : `Upload failed (${file.name})`;
        console.error(`Failed to upload ${file.name}:`, e);
        failedFiles.push(`${file.name}: ${detail}`);
      }
    }

    await refresh();

    if (failedFiles.length > 0) {
      setFiles((prev) =>
        prev.filter((f) =>
          failedFiles.some((entry) => entry.startsWith(`${f.name}:`)),
        ),
      );
      setErrorMessage(
        `${successCount} uploaded, ${failedFiles.length} failed: ${failedFiles.join('; ')}`,
      );
      setUploadState('error');
      return;
    }

    setFiles([]);
    setUploadState('success');
    if (successResetRef.current) {
      clearTimeout(successResetRef.current);
    }
    successResetRef.current = setTimeout(() => setUploadState('idle'), 2500);
  };

  const isUploading = uploadState === 'uploading';

  return (
    <div className="w-full">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`border-2 border-dashed rounded-xl p-12 text-center transition ${
          dragOver
            ? 'border-indigo-500 bg-indigo-500/10'
            : 'border-gray-700 hover:border-gray-600'
        }`}
      >
        <p className="text-gray-300 mb-4">Drag & drop files here</p>
        <Button
          onClick={() => inputRef.current?.click()}
          disabled={isUploading}
        >
          Browse Files
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".txt,.md,.markdown,.json,.pdf"
          className="hidden"
          onChange={onSelect}
        />
      </div>

      {files.length > 0 && (
        <ul className="mt-6 space-y-2">
          {files.map((f, i) => (
            <li
              key={`${f.name}-${i}`}
              className="flex items-center justify-between bg-gray-900 rounded-lg px-4 py-3"
            >
              <span className="truncate mr-4">{f.name}</span>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-sm text-gray-400">
                  {(f.size / 1024).toFixed(1)} KB
                </span>
                {!isUploading && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeFile(i)}
                    title="Remove file"
                    aria-label={`Remove ${f.name}`}
                    className="min-w-7 px-2"
                  >
                    ✕
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {files.length > 0 && (
        <div className="mt-6 flex justify-end">
          <Button onClick={() => void upload()} disabled={isUploading}>
            {isUploading ? 'Uploading...' : `Upload (${files.length})`}
          </Button>
        </div>
      )}

      {uploadState === 'success' && (
        <p className="mt-4 text-sm text-green-400">
          Upload complete. Processing will update live.
        </p>
      )}

      {errorMessage && (
        <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-start justify-between gap-2">
          <span>{errorMessage}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setErrorMessage(null)}
            aria-label="Dismiss error"
            className="min-w-7 px-2 shrink-0"
          >
            ✕
          </Button>
        </div>
      )}
    </div>
  );
}
