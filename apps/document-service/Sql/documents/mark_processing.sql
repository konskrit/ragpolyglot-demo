UPDATE documents
SET status = 'processing', updated_at = NOW()
WHERE id = @id;
