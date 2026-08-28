UPDATE documents
SET status = 'processing', error_reason = NULL, updated_at = NOW()
WHERE id = @id;
