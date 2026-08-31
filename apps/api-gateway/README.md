# api-gateway

> **WIP** — NestJS BFF for RAGPolyglot.

Routes document CRUD (upload, retry, ocr-lang, pause/resume, delete, chunks) to document-service, RAG chat to rag-worker (`POST /api/chat` JSON, `POST /api/chat/stream` NDJSON), caches answers in Redis, and serves `GET /api/health` + `GET /api/metrics` (Redis counters + Postgres logs). Conversations REST under `/api/conversations`.

Consumes RabbitMQ `document.processed` / `failed` / `paused` / `progress` and fans out Socket.IO `document:status-update` (namespace `/ws`). Clients join with `subscribe:document`.

WebSocket chat: `chat:query`, `chat:token` (live LLM deltas), `chat:complete`, `chat:interrupt` (aborts the in-flight worker stream).

```bash
npx nx serve api-gateway   # needs Postgres, Redis, RabbitMQ, workers
npx nx test api-gateway
```

Docker: `docker compose up` (port `3000`).

Integration: `npm run test:integration` (`--profile test` + `apps/api-gateway-e2e`).
