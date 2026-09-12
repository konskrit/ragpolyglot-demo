INSERT INTO conversations (id, title, document_ids)
VALUES ($1, $2, $3::jsonb)
ON CONFLICT (id) DO UPDATE SET
  updated_at = NOW(),
  document_ids = EXCLUDED.document_ids;
