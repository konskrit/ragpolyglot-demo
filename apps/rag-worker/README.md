# rag-worker

> **WIP** — Go RAG pipeline worker.

Consumes `document.uploaded` / `document.deleted`, chunks (~750 tokens, 10% overlap), embeds (API or local fallback), writes pgvector chunks, publishes `document.processed` / `document.failed`. Exposes `POST /api/search` and `GET /health`.

```bash
cd apps/rag-worker && go run .
npx nx test rag-worker
```

Docker: compose service on port `8081`. Shares `/uploads` with the gateway.
