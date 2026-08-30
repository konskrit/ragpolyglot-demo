SELECT id,
       conversation_id::text AS "conversationId",
       role,
       content AS "text",
       sources,
       created_at AS "createdAt"
FROM messages
WHERE conversation_id = $1
ORDER BY created_at ASC, id ASC;
