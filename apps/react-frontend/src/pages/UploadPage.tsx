import { FileUploadZone } from '../components/FileUploadZone';

export function UploadPage() {
  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-3xl font-semibold mb-2">Upload Documents</h1>
      <p className="text-gray-400 mb-8">Drag and drop files to start building your knowledge base.</p>
      <FileUploadZone />
    </div>
  );
}
