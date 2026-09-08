SELECT NULLIF(metadata->>'usedMemoryBytes', '') AS used_memory,
       COALESCE(metadata->'queues', '{}'::jsonb) AS queues
FROM system_logs
WHERE service = 'event-processor'
  AND event_type = 'redis.stats'
ORDER BY created_at DESC
LIMIT 1;
