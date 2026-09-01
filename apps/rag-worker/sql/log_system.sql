INSERT INTO system_logs (service, event_type, document_id, metadata, duration_ms)
VALUES ('rag-worker', $1, $2, $3, $4)
