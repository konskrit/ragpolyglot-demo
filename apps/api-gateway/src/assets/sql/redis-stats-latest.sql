SELECT
  NULLIF(metadata->>'usedMemoryBytes', '') AS used_memory,
  metadata->'queues' AS queues
FROM system_logs
WHERE service = 'event-processor'
  AND event_type = 'redis.stats'
ORDER BY created_at DESC
LIMIT 1;
