UPDATE documents
SET summarize_status = 'failed',
    summarize_error = @errorReason,
    updated_at = NOW()
WHERE id = @id
  AND (summarize_status IS NULL OR summarize_status IN ('running', 'paused'));
