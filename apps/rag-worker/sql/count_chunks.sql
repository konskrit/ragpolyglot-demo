SELECT COUNT(*)
FROM document_chunks
WHERE document_id = $1
  AND chunk_index >= 0
