# event-processor

> **WIP** — Go background job runner (non-RAG).

Listens on `system.events` / `background.jobs.queue` for cleanup, log archive/purge, and Redis snapshots. Must not touch the document RAG pipeline.

```bash
cd apps/event-processor && go run .
npx nx test event-processor
```

Docker: compose service on port `8082`.
