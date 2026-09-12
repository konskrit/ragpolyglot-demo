SELECT id::text,
       title,
       document_ids AS "documentIds",
       created_at AS "createdAt",
       updated_at AS "updatedAt"
FROM conversations
WHERE id = $1;
