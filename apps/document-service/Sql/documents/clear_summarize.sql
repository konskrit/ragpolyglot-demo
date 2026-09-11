UPDATE documents
SET summarize_status = NULL,
    summarize_done = NULL,
    summarize_total = NULL,
    summarize_error = NULL,
    updated_at = NOW()
WHERE id = @id;
