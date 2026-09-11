import { Link } from 'react-router-dom';
import type { RefObject, UIEvent } from 'react';
import { formatSimilarityPercent } from '../lib/formatSimilarity';
import { sourceLabel, sourceLink } from '../lib/chatSources';
import type { DocumentSummary, Message } from '@ragpolyglot-shared';

export function ChatMessageList({
  messages,
  documents,
  endRef,
  onScroll,
}: {
  messages: Message[];
  documents: DocumentSummary[];
  endRef: RefObject<HTMLDivElement | null>;
  onScroll: (e: UIEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      className="flex-1 overflow-y-auto p-4 space-y-4"
      role="log"
      aria-live="polite"
      aria-relevant="additions"
      onScroll={onScroll}
    >
      {messages.length === 0 && (
        <p className="text-center text-gray-500 mt-8">
          Ask a question about your uploaded documents.
        </p>
      )}
      {messages.map((m, i) => (
        <div
          key={i}
          className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
        >
          <div className="max-w-[80%] space-y-2">
            <div
              className={`rounded-lg px-4 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                m.role === 'user'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-800 text-gray-100'
              }`}
            >
              {m.text || <span className="animate-pulse">Retrieving…</span>}
            </div>

            {m.sources && m.sources.length > 0 && (
              <div className="space-y-2 ml-2 mt-1">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                  Sources
                </p>
                {m.sources.map((s) => (
                  <div
                    key={`${s.documentId}-${s.chunkIndex ?? 'x'}-${s.similarity}`}
                    className="bg-gray-800/50 border border-gray-700 rounded-lg p-3 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      {s.documentId ? (
                        <Link
                          to={sourceLink(s)}
                          className="font-medium text-indigo-400 truncate hover:text-indigo-300 hover:underline"
                        >
                          {sourceLabel(s, documents)}
                          {typeof s.chunkIndex === 'number'
                            ? ` · chunk ${s.chunkIndex + 1}`
                            : ''}
                        </Link>
                      ) : (
                        <span className="font-medium text-indigo-400 truncate">
                          {sourceLabel(s, documents)}
                        </span>
                      )}
                      <span className="text-green-400 font-mono shrink-0">
                        {formatSimilarityPercent(s.similarity)}
                      </span>
                    </div>
                    <p className="text-gray-500 line-clamp-2">
                      {s.chunkContent}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
}
