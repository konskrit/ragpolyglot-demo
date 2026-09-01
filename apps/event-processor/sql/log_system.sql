INSERT INTO system_logs (service, event_type, metadata, duration_ms)
VALUES ('event-processor', $1, $2, $3)
