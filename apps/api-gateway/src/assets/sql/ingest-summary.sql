SELECT COUNT(*)::text AS processed,
       ROUND(AVG((metadata->>'chunkingDurationMs')::float)::numeric, 1)::text AS avg_chunking,
       ROUND(AVG((metadata->>'embeddingDurationMs')::float)::numeric, 1)::text AS avg_embedding
FROM system_logs
WHERE event_type = 'document.processed'
  AND created_at > NOW() - INTERVAL '24 hours';
