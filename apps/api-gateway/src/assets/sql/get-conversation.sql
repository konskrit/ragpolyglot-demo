SELECT id::text,
       title,
       created_at AS "createdAt",
       updated_at AS "updatedAt"
FROM conversations
WHERE id = $1;
