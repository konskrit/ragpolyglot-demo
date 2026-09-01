UPDATE documents
SET status = 'failed',
    error_reason = 'stale_timeout',
    progress_stage = NULL,
    progress_done = NULL,
    progress_total = NULL,
    updated_at = NOW()
WHERE status = 'processing'
  AND updated_at < NOW() - (@minutes * INTERVAL '1 minute')
  AND COALESCE(progress_stage, '') != 'waiting_for_ocr';
