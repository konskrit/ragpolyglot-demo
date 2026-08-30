UPDATE documents
SET status = 'processing',
    error_reason = NULL,
    progress_stage = NULL,
    progress_done = NULL,
    progress_total = NULL,
    ocr_lang = @ocrLang,
    updated_at = NOW()
WHERE id = @id
  AND (
    status = 'paused'
    OR (status = 'processing' AND progress_stage = 'extracting')
    OR (status = 'failed' AND error_reason = 'ocr_language_needed')
  )
RETURNING id, title, file_path, status, uploaded_by, error_reason, retry_count, progress_stage, progress_done, progress_total, ocr_lang, created_at, updated_at;
