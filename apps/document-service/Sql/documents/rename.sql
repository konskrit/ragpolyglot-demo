UPDATE documents
SET title = @title,
    updated_at = NOW()
WHERE id = @id
  AND NOT EXISTS (
    SELECT 1
    FROM documents other
    WHERE other.id <> @id
      AND lower(other.title) = lower(@title)
  )
RETURNING id, title, file_path, status, uploaded_by, error_reason, retry_count, progress_stage, progress_done, progress_total, ocr_lang, summarize_status, summarize_done, summarize_total, summarize_error, created_at, updated_at;
