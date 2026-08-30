import { Button } from './Button';
import type { ConversationSummary } from '@ragpolyglot-shared';

export function ConversationSidebar({
  conversations,
  selectedId,
  loading,
  error,
  onSelect,
  onNew,
  onDelete,
}: {
  conversations: ConversationSummary[];
  selectedId: string;
  loading: boolean;
  error: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <aside className="w-64 shrink-0 flex flex-col bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
      <div className="p-3 border-b border-gray-800">
        <Button
          variant="secondary"
          size="sm"
          className="w-full"
          onClick={onNew}
        >
          New chat
        </Button>
      </div>
      {error && <p className="px-3 py-2 text-xs text-red-400">{error}</p>}
      <ul className="flex-1 overflow-y-auto p-2 space-y-1">
        {conversations.length === 0 && !error && (
          <li className="px-2 py-6 text-center text-xs text-gray-500">
            {loading ? 'Loading…' : 'No conversations yet'}
          </li>
        )}
        {conversations.map((c) => {
          const active = c.id === selectedId;
          return (
            <li key={c.id}>
              <div
                className={`flex items-start gap-1 rounded-lg px-2 py-2 ${
                  active ? 'bg-gray-800' : 'hover:bg-gray-800/60'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelect(c.id)}
                  className="flex-1 min-w-0 text-left"
                >
                  <span
                    className={`block text-sm truncate ${
                      active ? 'text-white' : 'text-gray-300'
                    }`}
                  >
                    {c.title}
                  </span>
                  <span className="block text-[11px] text-gray-500 mt-0.5">
                    {new Date(c.updatedAt).toLocaleString()}
                  </span>
                </button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="min-w-7 px-2 shrink-0"
                  aria-label={`Delete ${c.title}`}
                  onClick={() => void onDelete(c.id)}
                >
                  ✕
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
