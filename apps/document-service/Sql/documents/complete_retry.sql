UPDATE documents
SET retry_count = retry_count + 1, updated_at = NOW()
WHERE id = @id
RETURNING id, title, file_path, status, uploaded_by, error_reason, retry_count, progress_stage, progress_done, progress_total, ocr_lang, created_at, updated_at;
