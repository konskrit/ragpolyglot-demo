SELECT id
FROM documents
WHERE status = 'ready'
  AND summarize_status = 'failed'
  AND summarize_retry_count < @maxRetries
  AND (summarize_error IS DISTINCT FROM 'no_chunks')
  AND updated_at < NOW() - (@minAgeMinutes * INTERVAL '1 minute')
ORDER BY updated_at
LIMIT @limit;
