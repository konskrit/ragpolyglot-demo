SELECT status, COUNT(*)::text AS count
FROM documents
GROUP BY status;
