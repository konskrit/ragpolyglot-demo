SELECT id::text,
       title,
       document_ids AS "documentIds",
       created_at AS "createdAt",
       updated_at AS "updatedAt"
FROM conversations
ORDER BY updated_at DESC
LIMIT 50;
