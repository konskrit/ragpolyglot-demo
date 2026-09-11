SELECT content
FROM document_chunks
WHERE document_id = @id
  AND chunk_index = -1
LIMIT 1;
