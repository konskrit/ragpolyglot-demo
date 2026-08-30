UPDATE documents
SET status = 'processing',
    error_reason = NULL,
    updated_at = NOW()
WHERE id = @id AND status = 'paused'
RETURNING id, title, file_path, status, uploaded_by, error_reason, retry_count, progress_stage, progress_done, progress_total, ocr_lang, created_at, updated_at;
