import { useState } from 'react';
import type { DocumentSummary } from '@ragpolyglot-shared';

function chipClass(active: boolean) {
  return `rounded-lg border px-2.5 py-1 text-xs max-w-full truncate ${
    active
      ? 'border-indigo-500 bg-indigo-950/40 text-indigo-100'
      : 'border-gray-700 bg-gray-950/40 text-gray-300 hover:border-gray-500'
  }`;
}

export function ChatDocumentScope({
  documents,
  selectedIds,
  onChange,
}: {
  documents: DocumentSummary[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const ready = documents.filter((d) => d.status === 'ready');
  const all = selectedIds.length === 0;
  const [picking, setPicking] = useState(false);

  if (ready.length === 0) return null;

  const selected = ready.filter((d) => selectedIds.includes(d.id));

  const selectAll = () => {
    onChange([]);
    setPicking(false);
  };

  const toggle = (id: string) => {
    if (all) {
      onChange([id]);
      return;
    }
    const next = selectedIds.includes(id)
      ? selectedIds.filter((x) => x !== id)
      : [...selectedIds, id];
    if (next.length === 0) {
      selectAll();
      return;
    }
    onChange(next);
  };

  return (
    <aside
      className="w-52 shrink-0 flex flex-col gap-2 h-150 rounded-xl border border-gray-800 bg-gray-900 p-3"
      aria-label="Document scope"
    >
      <p className="text-xs font-medium text-gray-400 shrink-0">Context</p>

      {!picking ? (
        <>
          <button
            type="button"
            aria-pressed={all}
            onClick={selectAll}
            className={`${chipClass(all)} text-left w-full shrink-0`}
          >
            All documents
            <span className="block text-[10px] text-gray-500 font-normal mt-0.5 truncate">
              {ready.length} ready
            </span>
          </button>

          {!all && (
            <div className="flex flex-wrap gap-1.5 flex-1 min-h-0 overflow-y-auto content-start">
              {selected.map((doc) => (
                <span
                  key={doc.id}
                  title={doc.title}
                  className={chipClass(true)}
                >
                  {doc.title}
                </span>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() => setPicking(true)}
            className="text-xs text-indigo-400 hover:text-indigo-300 text-left shrink-0"
          >
            {all ? 'Choose documents…' : 'Change selection…'}
          </button>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2 shrink-0">
            <button
              type="button"
              onClick={selectAll}
              className="text-xs text-gray-400 hover:text-gray-200"
            >
              Use all
            </button>
            <button
              type="button"
              onClick={() => setPicking(false)}
              className="text-xs text-indigo-400 hover:text-indigo-300"
            >
              Done
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5 flex-1 min-h-0 overflow-y-auto content-start">
            {ready.map((doc) => {
              const active = !all && selectedIds.includes(doc.id);
              return (
                <button
                  key={doc.id}
                  type="button"
                  aria-pressed={active}
                  title={doc.title}
                  onClick={() => toggle(doc.id)}
                  className={chipClass(active)}
                >
                  {doc.title}
                </button>
              );
            })}
          </div>
          <p className="text-[10px] text-gray-500 shrink-0">
            {all
              ? 'Pick one or more to narrow search'
              : `${selectedIds.length} selected · clear last to use all`}
          </p>
        </>
      )}
    </aside>
  );
}
