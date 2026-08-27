INSERT INTO system_logs (service, event_type, document_id, metadata, duration_ms)
VALUES ('document-service', @eventType, @documentId, @metadata, NULL);
