SELECT d.id::text,
       c.chunk_index,
       c.content,
       1 - (c.embedding <=> $1::vector) AS similarity,
       d.title
FROM document_chunks c
JOIN documents d ON d.id = c.document_id
WHERE c.embedding IS NOT NULL
ORDER BY c.embedding <=> $1::vector
LIMIT $2
