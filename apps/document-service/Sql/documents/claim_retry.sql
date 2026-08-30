UPDATE documents
SET status = 'processing',
    error_reason = NULL,
    progress_stage = NULL,
    progress_done = NULL,
    progress_total = NULL,
    ocr_lang = CASE WHEN @updateOcrLang THEN @ocrLang ELSE ocr_lang END,
    updated_at = NOW()
WHERE id = @id AND status IN ('failed', 'ready')
RETURNING id, title, file_path, status, uploaded_by, error_reason, retry_count, progress_stage, progress_done, progress_total, ocr_lang, created_at, updated_at;
