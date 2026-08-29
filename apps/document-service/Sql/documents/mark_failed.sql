UPDATE documents
SET status = 'failed', error_reason = @errorReason, progress_stage = NULL, progress_done = NULL, progress_total = NULL, updated_at = NOW()
WHERE id = @id;
