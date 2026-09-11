INSERT INTO document_summarize_checkpoints (
    document_id, stage, done, total, partials, context_chars, updated_at
) VALUES (
    $1, $2, $3, $4, $5::jsonb, $6, NOW()
)
ON CONFLICT (document_id) DO UPDATE SET
    stage = EXCLUDED.stage,
    done = EXCLUDED.done,
    total = EXCLUDED.total,
    partials = EXCLUDED.partials,
    context_chars = EXCLUDED.context_chars,
    updated_at = NOW();
