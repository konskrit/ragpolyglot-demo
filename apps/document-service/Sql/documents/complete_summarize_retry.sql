UPDATE documents
SET summarize_retry_count = summarize_retry_count + 1,
    updated_at = NOW()
WHERE id = @id;
