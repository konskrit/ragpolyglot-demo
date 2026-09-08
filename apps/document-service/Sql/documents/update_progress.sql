UPDATE documents
SET progress_stage = @stage,
    progress_done = @done,
    progress_total = @total,
    retry_count = CASE
        WHEN progress_done IS NULL OR @done > progress_done THEN 0
        ELSE retry_count
    END,
    updated_at = NOW()
WHERE id = @id AND status = 'processing';
