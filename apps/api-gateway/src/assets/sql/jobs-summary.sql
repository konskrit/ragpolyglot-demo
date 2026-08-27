SELECT COUNT(*) FILTER (WHERE event_type = 'job.completed')::text AS completed,
       COUNT(*) FILTER (WHERE event_type = 'job.failed')::text AS failed
FROM system_logs
WHERE service = 'event-processor'
  AND event_type IN ('job.completed', 'job.failed')
  AND created_at > NOW() - INTERVAL '24 hours';
