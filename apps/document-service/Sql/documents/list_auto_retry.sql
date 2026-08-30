SELECT id
FROM documents
WHERE status = 'failed'
  AND retry_count < @maxRetries
  AND (error_reason IS DISTINCT FROM 'ocr_language_needed')
  AND updated_at < NOW() - (@minAgeMinutes * INTERVAL '1 minute')
ORDER BY updated_at
LIMIT @limit;
