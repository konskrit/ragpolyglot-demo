# event-processor

Go background job runner (non-RAG).

Listens on `background.jobs.queue` (`system.events` exchange). Must not run the RAG pipeline or change document metadata directly — maintenance calls go through document-service HTTP.

## Scheduled jobs

| Job                       | Interval                               |
| ------------------------- | -------------------------------------- |
| `snapshot_redis_stats`    | 1m (also on connect)                   |
| `cleanup_stale_job_locks` | 5m                                     |
| `fail_stale_processing`   | 5m                                     |
| `auto_retry_failed`       | `AUTO_RETRY_INTERVAL_MINUTES` (min 1m) |
| `archive_old_logs`        | 24h                                    |
| `purge_archived_logs`     | 7d                                     |

`cleanup_expired_sessions` is implemented but not scheduled (no sessions yet).

`cleanup_stale_job_locks` removes `job:*:processing` keys that have **no TTL** (immortal locks). Normal locks expire in 5m; acquire also clears a no-TTL lock and retries once.

```bash
cd apps/event-processor && go run .
npx nx test event-processor
```

Docker: port `8082`.
