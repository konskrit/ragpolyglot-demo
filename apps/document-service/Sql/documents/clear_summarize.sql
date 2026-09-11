UPDATE documents
SET summarize_status = NULL,
    summarize_done = NULL,
    summarize_total = NULL,
    summarize_error = NULL,
    summarize_retry_count = 0,
    updated_at = NOW()
WHERE id = @id;
