UPDATE documents
SET status = 'ready',
    error_reason = NULL,
    progress_stage = NULL,
    progress_done = NULL,
    progress_total = NULL,
    ocr_lang = COALESCE(@ocrLang, ocr_lang),
    updated_at = NOW()
WHERE id = @id AND status = 'processing';
