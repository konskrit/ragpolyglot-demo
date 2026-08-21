import { Link, useLocation } from 'react-router-dom';
import { useWebSocketStatus } from '../hooks/useWebSocket';

const nav = [
  { to: '/', label: 'Dashboard' },
  { to: '/upload', label: 'Upload' },
  { to: '/agent', label: 'Agent Mode' },
] as const;

export function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { connected } = useWebSocketStatus();

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="text-xl font-semibold tracking-tight">
            RAGPolyglot
          </Link>
          <nav className="flex items-center gap-6" aria-label="Primary">
            {nav.map(({ to, label }) => {
              const active = location.pathname === to;
              return (
                <Link
                  key={to}
                  to={to}
                  aria-current={active ? 'page' : undefined}
                  className={`transition ${
                    active ? 'text-white' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {label}
                </Link>
              );
            })}
            <span
              className={`text-[10px] uppercase tracking-wide ${
                connected ? 'text-green-500' : 'text-red-400'
              }`}
              title={
                connected ? 'WebSocket connected' : 'WebSocket disconnected'
              }
              role="status"
              aria-live="polite"
            >
              {connected ? 'Live' : 'Offline'}
            </span>
          </nav>
        </div>
      </header>
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-8">
        {children}
      </main>
    </div>
  );
}
