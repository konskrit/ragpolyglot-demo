SELECT date_trunc('hour', created_at) AS hour,
       COUNT(*)::text AS count,
       ROUND(AVG(duration_ms)::numeric, 1)::text AS avg_ms
FROM query_logs
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY 1
ORDER BY 1;
