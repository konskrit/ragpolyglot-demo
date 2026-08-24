import { AgentChat } from '../components/AgentChat';

export function AgentPage() {
  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-3xl font-semibold mb-2">Agent Mode</h1>
      <p className="text-gray-400 mb-2">
        Ask questions grounded in your uploaded documents.
      </p>
      <p className="text-sm text-gray-500 mb-8">
        Answers are generated from retrieved document chunks using the
        configured LLM.
      </p>
      <AgentChat />
    </div>
  );
}
