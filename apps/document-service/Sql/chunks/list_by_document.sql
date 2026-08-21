SELECT id, document_id, chunk_index, content, created_at
FROM document_chunks
WHERE document_id = @id
ORDER BY chunk_index;
