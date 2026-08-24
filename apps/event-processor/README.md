# event-processor

> **WIP** — Go background job runner (non-RAG).

Listens on `background.jobs.queue` (`system.events` exchange) for cleanup, log archive/purge, and Redis snapshots. Must not run the RAG pipeline or change document metadata.

Handlers are implemented. Nothing else in this repo publishes jobs, so the service idles until a message is sent (manual or a future scheduler).

```bash
cd apps/event-processor && go run .
npx nx test event-processor
```

Docker: port `8082`.
