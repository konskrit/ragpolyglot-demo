import { AgentChat } from '../components/AgentChat';
import { useDocuments } from '../context/DocumentsProvider';

export function AgentPage() {
  const { hasReadyDocuments } = useDocuments();

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-3xl font-semibold mb-2">Agent Mode</h1>
      <p className="text-gray-400 mb-2">
        Ask questions grounded in your uploaded documents.
      </p>
      <p className="text-sm text-gray-500 mb-8">
        Answers are retrieved document excerpts ranked by similarity (no LLM
        synthesis yet).
      </p>
      <AgentChat hasDocuments={hasReadyDocuments} />
      {!hasReadyDocuments && (
        <p className="text-amber-400 mt-4 text-sm" role="status">
          Agent mode unlocks when at least one document is Ready.
        </p>
      )}
    </div>
  );
}
