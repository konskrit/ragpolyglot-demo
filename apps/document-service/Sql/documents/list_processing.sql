SELECT id, title, file_path, status, uploaded_by, error_reason, retry_count, progress_stage, progress_done, progress_total, ocr_lang, summarize_status, summarize_done, summarize_total, summarize_error, created_at, updated_at
FROM documents
WHERE status = 'processing'
ORDER BY updated_at;
