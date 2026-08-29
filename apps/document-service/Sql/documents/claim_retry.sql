UPDATE documents
SET status = 'processing',
    error_reason = NULL,
    progress_stage = NULL,
    progress_done = NULL,
    progress_total = NULL,
    updated_at = NOW()
WHERE id = @id AND status = 'failed'
RETURNING id, title, file_path, status, uploaded_by, error_reason, retry_count, progress_stage, progress_done, progress_total, created_at, updated_at;
