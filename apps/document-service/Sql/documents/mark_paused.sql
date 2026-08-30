UPDATE documents
SET status = 'paused',
    updated_at = NOW()
WHERE id = @id AND status = 'processing';
