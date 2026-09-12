SELECT c.document_id::text,
       d.title,
       c.content
FROM document_chunks c
JOIN documents d ON d.id = c.document_id
WHERE c.chunk_index = -1
  AND c.document_id::text = ANY($1::text[])
  AND c.content IS NOT NULL
  AND btrim(c.content) <> ''
ORDER BY d.title, c.document_id
