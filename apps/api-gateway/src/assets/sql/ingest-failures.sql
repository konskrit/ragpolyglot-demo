SELECT COUNT(*)::text AS count
FROM system_logs
WHERE event_type IN ('chunking_error', 'embedding_error', 'storage_error')
  AND created_at > NOW() - INTERVAL '24 hours';
