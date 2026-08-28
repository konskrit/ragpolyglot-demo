UPDATE documents
SET status = 'ready', error_reason = NULL, updated_at = NOW()
WHERE id = @id;
