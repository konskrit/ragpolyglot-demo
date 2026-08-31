# event-processor

Go background job runner (non-RAG). Listens on `background.jobs.queue` (`system.events` exchange).

In-process scheduler (run interval): Redis snapshot (1m), stale lock cleanup (5m), fail stuck processing (5m, document-service), failed-document auto-retry (1m, document-service), log archive (24h), archive purge (7d). Archive moves logs older than `LOG_RETENTION_DAYS` (default 30). Purge deletes archives older than 3× that.

```bash
cd apps/event-processor && go run .
npx nx test event-processor
```

Docker: port `8082`.
