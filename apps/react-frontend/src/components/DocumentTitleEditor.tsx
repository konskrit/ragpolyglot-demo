import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import type { DocumentSummary } from '@ragpolyglot-shared';
import { StatusBadge } from './StatusBadge';

export function DocumentTitleEditor({
  doc,
  onRename,
}: {
  doc: DocumentSummary;
  onRename: (title: string) => Promise<DocumentSummary>;
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!editing) {
    return (
      <div className="flex flex-wrap items-center gap-3 min-w-0 flex-1">
        <h1 className="text-2xl font-semibold text-white min-w-0 break-words">
          {doc.title}
        </h1>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setEditing(true);
          }}
          className="text-sm text-indigo-400 hover:text-indigo-300 shrink-0"
        >
          Rename
        </button>
        <StatusBadge status={doc.status} />
      </div>
    );
  }

  return (
    <div className="space-y-1 min-w-0 flex-1">
      <form
        className="flex flex-wrap items-center gap-2 min-w-0"
        action={async (formData) => {
          const next = String(formData.get('title') ?? '').trim();
          if (!next) {
            setError('Title is required.');
            return;
          }
          if (next === doc.title) {
            setError(null);
            setEditing(false);
            return;
          }
          setError(null);
          try {
            await onRename(next);
            setEditing(false);
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Rename failed');
          }
        }}
      >
        <input
          name="title"
          required
          autoFocus
          defaultValue={doc.title}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setError(null);
              setEditing(false);
            }
          }}
          aria-label="Document title"
          className="min-w-0 flex-1 max-w-md rounded-lg border border-gray-700 bg-gray-950 px-3 py-1.5 text-2xl font-semibold text-white"
        />
        <TitleFormActions
          onCancel={() => {
            setError(null);
            setEditing(false);
          }}
        />
        <StatusBadge status={doc.status} />
      </form>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}

function TitleFormActions({ onCancel }: { onCancel: () => void }) {
  const { pending } = useFormStatus();
  return (
    <>
      <button
        type="submit"
        disabled={pending}
        className="text-sm text-indigo-400 hover:text-indigo-300 disabled:opacity-50"
      >
        {pending ? 'Saving…' : 'Save'}
      </button>
      <button
        type="button"
        onClick={onCancel}
        disabled={pending}
        className="text-sm text-gray-400 hover:text-gray-300 disabled:opacity-50"
      >
        Cancel
      </button>
    </>
  );
}
