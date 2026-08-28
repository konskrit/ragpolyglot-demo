import { useState, useRef, useEffect } from 'react';
import { ApiError, postFormData } from '../api/client';
import { subscribeDocument } from '../hooks/useWebSocket';
import { useDocuments } from '../context/DocumentsProvider';
import { DocumentRow } from './DocumentRow';
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

  const { documents, refresh, remove, retry } = useDocuments();

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
        <button
          onClick={() => inputRef.current?.click()}
          disabled={isUploading}
          className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 transition text-white font-medium disabled:opacity-40"
        >
          Browse Files
        </button>
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
                  <button
                    onClick={() => removeFile(i)}
                    className="text-gray-500 hover:text-red-400 transition"
                    title="Remove file"
                  >
                    ✕
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {files.length > 0 && (
        <div className="mt-6 flex justify-end">
          <button
            onClick={() => void upload()}
            disabled={isUploading}
            className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium"
          >
            {isUploading ? 'Uploading...' : `Upload (${files.length})`}
          </button>
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
          <button
            onClick={() => setErrorMessage(null)}
            className="text-red-400 hover:text-red-300 shrink-0"
          >
            ✕
          </button>
        </div>
      )}

      {documents.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-medium mb-4 text-gray-300">
            Your Documents
          </h2>
          <ul className="space-y-2">
            {documents.map((doc) => (
              <DocumentRow
                key={doc.id}
                doc={doc}
                onRemove={remove}
                onRetry={retry}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
