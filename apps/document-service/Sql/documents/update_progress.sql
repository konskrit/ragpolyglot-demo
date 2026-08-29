UPDATE documents
SET progress_stage = @stage,
    progress_done = @done,
    progress_total = @total,
    updated_at = NOW()
WHERE id = @id AND status = 'processing';
