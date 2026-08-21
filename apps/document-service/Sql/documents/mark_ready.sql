UPDATE documents
SET status = 'ready', updated_at = NOW()
WHERE id = @id;
