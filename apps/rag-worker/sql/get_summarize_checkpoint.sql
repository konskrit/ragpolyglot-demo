SELECT document_id, stage, done, total, partials::text, context_chars
FROM document_summarize_checkpoints
WHERE document_id = $1;
