UPDATE documents
SET summarize_done = @done,
    summarize_total = @total,
    updated_at = NOW()
WHERE id = @id
  AND summarize_status = 'running';
