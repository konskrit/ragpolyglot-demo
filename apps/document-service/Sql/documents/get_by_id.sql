SELECT id, title, file_path, status, uploaded_by, error_reason, retry_count, progress_stage, progress_done, progress_total, created_at, updated_at
FROM documents
WHERE id = @id;
