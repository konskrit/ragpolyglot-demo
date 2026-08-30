import { Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { DocumentsProvider } from './context/DocumentsProvider';
import { UploadPage } from './pages/UploadPage';
import { AgentPage } from './pages/AgentPage';
import { DocumentsPage } from './pages/DocumentsPage';
import { DocumentDetailPage } from './pages/DocumentDetailPage';
import { DashboardPage } from './pages/DashboardPage';

export default function App() {
  return (
    <DocumentsProvider>
      <Layout>
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/documents" element={<DocumentsPage />} />
            <Route path="/documents/:id" element={<DocumentDetailPage />} />
            <Route path="/upload" element={<UploadPage />} />
            <Route path="/agent" element={<AgentPage />} />
          </Routes>
        </ErrorBoundary>
      </Layout>
    </DocumentsProvider>
  );
}
