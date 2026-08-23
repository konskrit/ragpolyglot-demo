# api-gateway

> **WIP** — NestJS BFF for RAGPolyglot.

Routes document CRUD to the .NET service, RAG chat to the Go worker (`POST /api/chat`), caches query results in Redis, and streams chat + document status over Socket.IO (`/ws`).

WebSocket events: `chat:query`, `chat:token`, `chat:complete`, `chat:interrupt` (aborts in-flight worker request), `document:status-update`.

```bash
npx nx serve api-gateway   # local (needs deps up)
npx nx test api-gateway
```

Docker: included in root `docker compose up` (port `3000`).
