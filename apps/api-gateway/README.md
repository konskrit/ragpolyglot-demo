# api-gateway

> **WIP** — NestJS BFF for RAGPolyglot.

Routes document CRUD to document-service, RAG chat to rag-worker (`POST /api/chat`), caches answers in Redis, and serves `GET /api/metrics` from Redis counters plus Postgres logs (`DATABASE_URL`). Streams chat and document status over Socket.IO (`/ws`).

WebSocket: `chat:query`, `chat:token`, `chat:complete`, `chat:interrupt` (aborts the in-flight worker request), `document:status-update`.

`chat:token` is paced playback of the full LLM answer, not native model streaming.

```bash
npx nx serve api-gateway   # needs Postgres, Redis, RabbitMQ, workers
npx nx test api-gateway
```

Docker: `docker compose up` (port `3000`).

Integration: `npm run test:integration` (`--profile test` + `apps/api-gateway-e2e`).
