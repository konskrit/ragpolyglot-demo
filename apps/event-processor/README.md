# event-processor

> **WIP** — Go background job runner (non-RAG).

Listens on `background.jobs.queue` (`system.events` exchange) for cleanup, log archive/purge, and Redis snapshots. Must not run the RAG pipeline or change document metadata.

An in-process scheduler publishes: Redis snapshot (1m), stale lock cleanup (5m), log archive (24h), archive purge (7d).

```bash
cd apps/event-processor && go run .
npx nx test event-processor
```

Docker: port `8082`.
