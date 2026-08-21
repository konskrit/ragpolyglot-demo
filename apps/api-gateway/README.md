# api-gateway

> **WIP** — NestJS BFF for RAGPolyglot.

Routes document CRUD to the .NET service, RAG search to the Go worker, caches query results in Redis, and streams chat + document status over Socket.IO (`/ws`).

```bash
npx nx serve api-gateway   # local (needs deps up)
npx nx test api-gateway
```

Docker: included in root `docker compose up` (port `3000`).
