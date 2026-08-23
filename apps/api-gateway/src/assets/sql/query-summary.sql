SELECT COUNT(*)::text AS count,
       ROUND(AVG(duration_ms)::numeric, 1)::text AS avg_ms
FROM query_logs
WHERE created_at > NOW() - INTERVAL '24 hours';
