SELECT id, document_id, chunk_index, content, created_at
FROM document_chunks
WHERE document_id = @id
  AND chunk_index >= 0
ORDER BY chunk_index;
