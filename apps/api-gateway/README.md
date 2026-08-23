# api-gateway

> **WIP** — NestJS BFF for RAGPolyglot.

Routes document CRUD to the .NET service, RAG chat to the Go worker (`POST /api/chat`), caches query results in Redis, and streams chat + document status over Socket.IO (`/ws`).

WebSocket events: `chat:query`, `chat:token`, `chat:complete`, `chat:interrupt` (aborts in-flight worker request), `document:status-update`.

Token streaming is simulated playback after the full LLM response returns.

```bash
npx nx serve api-gateway   # local (needs deps up)
npx nx test api-gateway
```

Docker: root `docker compose up` (port `3000`).

Integration tests: `docker compose --profile test` + `apps/api-gateway-e2e`.
