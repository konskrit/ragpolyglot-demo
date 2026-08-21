UPDATE documents
SET status = 'failed', updated_at = NOW()
WHERE id = @id;
