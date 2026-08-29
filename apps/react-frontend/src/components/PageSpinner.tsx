export function PageSpinner() {
  return (
    <div className="flex items-center justify-center h-64">
      <div
        className="animate-spin rounded-full h-8 w-8 border-2 border-gray-700 border-t-indigo-500"
        role="status"
        aria-label="Loading"
      />
    </div>
  );
}
