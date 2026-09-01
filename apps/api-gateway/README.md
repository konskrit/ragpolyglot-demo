# api-gateway

NestJS BFF: document CRUD via document-service, RAG chat via rag-worker, Redis answer cache, `GET /api/metrics` from Redis counters plus Postgres logs.

REST `POST /api/chat` returns JSON. The UI uses Socket.IO `chat:query`, which calls rag-worker `POST /api/chat/stream`. Cache misses emit native LLM deltas (`chat:token`); cache hits emit the stored answer in one token. `chat:interrupt` aborts the in-flight worker request.

WebSocket namespace `/ws`: `chat:query`, `chat:token`, `chat:complete`, `chat:interrupt`, `document:status-update`.

```bash
npx nx serve api-gateway   # needs Postgres, Redis, RabbitMQ, workers
npx nx test api-gateway
```

Docker: `docker compose up` (port `3000`). Images, compose, env: [docs/docker](../../docs/docker/README.md).

Integration: `npm run test:integration` (`--profile test` + `apps/api-gateway-e2e`).
