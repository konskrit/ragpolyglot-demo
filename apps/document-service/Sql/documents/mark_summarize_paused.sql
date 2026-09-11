UPDATE documents
SET summarize_status = 'paused',
    updated_at = NOW()
WHERE id = @id
  AND status = 'ready'
  AND summarize_status = 'running';
