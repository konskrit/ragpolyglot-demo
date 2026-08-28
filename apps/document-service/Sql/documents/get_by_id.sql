SELECT id, title, file_path, status, uploaded_by, error_reason, retry_count, created_at, updated_at
FROM documents
WHERE id = @id;
