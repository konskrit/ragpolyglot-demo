WITH moved AS (
    DELETE FROM query_logs
    WHERE created_at < NOW() - make_interval(days => $1)
    RETURNING id, query, top_k, result_count, duration_ms, created_at
)
INSERT INTO query_logs_archive (id, query, top_k, result_count, duration_ms, created_at)
SELECT id, query, top_k, result_count, duration_ms, created_at FROM moved
