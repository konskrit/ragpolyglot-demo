INSERT INTO document_chunks (document_id, chunk_index, content, embedding)
VALUES ($1, $2, $3, $4::vector)
ON CONFLICT (document_id, chunk_index)
DO UPDATE SET content = EXCLUDED.content,
              embedding = EXCLUDED.embedding
