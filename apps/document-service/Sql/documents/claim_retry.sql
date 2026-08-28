UPDATE documents
SET status = 'processing',
    error_reason = NULL,
    updated_at = NOW()
WHERE id = @id AND status = 'failed'
RETURNING id, title, file_path, status, uploaded_by, error_reason, retry_count, created_at, updated_at;
