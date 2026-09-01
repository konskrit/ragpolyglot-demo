WITH moved AS (
    DELETE FROM system_logs
    WHERE created_at < NOW() - make_interval(days => $1)
    RETURNING id, service, event_type, document_id, metadata, duration_ms, created_at
)
INSERT INTO system_logs_archive (id, service, event_type, document_id, metadata, duration_ms, created_at)
SELECT id, service, event_type, document_id, metadata, duration_ms, created_at FROM moved
