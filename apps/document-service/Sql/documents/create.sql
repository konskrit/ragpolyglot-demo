INSERT INTO documents (title, file_path, status, uploaded_by)
SELECT @title, @filePath, @status, @uploadedBy
WHERE NOT EXISTS (
    SELECT 1
    FROM documents
    WHERE lower(title) = lower(@title)
)
RETURNING id, title, file_path, status, uploaded_by, error_reason, retry_count, progress_stage, progress_done, progress_total, ocr_lang, created_at, updated_at;
