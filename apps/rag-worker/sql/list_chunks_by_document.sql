SELECT chunk_index, content
FROM document_chunks
WHERE document_id = $1::uuid
  AND chunk_index >= 0
  AND content IS NOT NULL
  AND btrim(content) <> ''
ORDER BY chunk_index
