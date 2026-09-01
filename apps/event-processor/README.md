# event-processor

Go background job runner (non-RAG). Listens on `background.jobs.queue` (`system.events` exchange).

In-process scheduler (run interval): Redis snapshot (1m), stale lock cleanup (5m), fail stuck processing (5m, document-service — skips `waiting_for_ocr`), failed-document auto-retry (1m, document-service), log archive (24h), archive purge (7d). Archive moves logs older than `LOG_RETENTION_DAYS` (default 30). Purge deletes archives older than 3× that.

```bash
cd apps/event-processor && go run .
npx nx test event-processor
```

Docker: port `8082`.

## SQL

Queries live in `sql/*.sql`, embedded at build time via `//go:embed` (`sql/load.go` → `Must(name)`). `storage/store.go` loads them — no inline SQL in Go.

| File                                                             | Used by             |
| ---------------------------------------------------------------- | ------------------- |
| `schema.sql`                                                     | `EnsureSchema`      |
| `log_system.sql`                                                 | `LogSystem`         |
| `archive_system_logs.sql` / `archive_query_logs.sql`             | `ArchiveOldLogs`    |
| `purge_system_logs_archive.sql` / `purge_query_logs_archive.sql` | `PurgeArchivedLogs` |

Same pattern as document-service (`Sql/`) and api-gateway (`src/assets/sql/`).
