UPDATE documents
SET status = 'failed', error_reason = @errorReason, updated_at = NOW()
WHERE id = @id;
