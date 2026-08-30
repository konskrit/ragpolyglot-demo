SELECT id::text,
       title,
       created_at AS "createdAt",
       updated_at AS "updatedAt"
FROM conversations
ORDER BY updated_at DESC
LIMIT 50;
