UPDATE documents
SET summarize_done = @done,
    summarize_total = @total,
    summarize_retry_count = CASE
        WHEN summarize_done IS NULL OR @done > summarize_done THEN 0
        ELSE summarize_retry_count
    END,
    updated_at = NOW()
WHERE id = @id
  AND summarize_status = 'running';
