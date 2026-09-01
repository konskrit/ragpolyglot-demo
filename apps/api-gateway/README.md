# api-gateway

NestJS BFF: the **only public HTTP/WebSocket surface** for clients. Proxies document CRUD to document-service, RAG chat to rag-worker, aggregates health/metrics, Redis answer cache.

## API documentation

| URL                 | Purpose                                                                             |
| ------------------- | ----------------------------------------------------------------------------------- |
| `/docs`             | [Scalar](https://scalar.com/) UI — try REST endpoints, see request/response schemas |
| `/api/openapi-json` | OpenAPI 3 JSON (codegen, Postman, etc.)                                             |

- REST shapes are defined in `src/core/openapi-schemas.ts` (`@ApiProperty` classes mirroring `libs/shared`).
- WebSocket events are **not** OpenAPI operations — see the markdown table at the top of `/docs`.
- TypeScript source of truth for app code: `libs/shared`.

## REST vs WebSocket

| Use case                                         | Mechanism                                                       |
| ------------------------------------------------ | --------------------------------------------------------------- |
| Documents, health, metrics, conversation history | REST `/api/*`                                                   |
| One-shot chat (full JSON answer)                 | `POST /api/chat`                                                |
| Streaming chat (UI)                              | Socket.IO `/ws` → `chat:query` / `chat:token` / `chat:complete` |
| Live document status                             | Socket.IO → `subscribe:document` / `document:status-update`     |

Cache misses on WebSocket chat stream native LLM deltas; cache hits emit the stored answer in one token. `chat:interrupt` aborts the in-flight worker request.

## Maintaining docs

When you change a public response shape in `libs/shared`:

1. Update the matching class in `openapi-schemas.ts`.
2. Keep `@ApiOkResponse` / `@ApiBody` on the controller in sync.
3. Rebuild gateway — Scalar picks up changes on next start.

Enums (`DOCUMENT_STATUSES`, `DOCUMENT_PROGRESS_STAGES`) are imported from shared so OpenAPI stays aligned.

Postgres queries: `src/assets/sql/*.sql` via `loadSql()` (same idea as Go `sql.Must` / document-service `SqlScripts`).

```bash
npx nx serve api-gateway   # needs Postgres, Redis, RabbitMQ, workers
npx nx test api-gateway
```

Docker: `docker compose up` (port `3000`). Compose/env: [docs/docker-compose.yml](../../docs/docker-compose.yml/README.md).

Integration: `npm run test:integration` (`--profile test` + `apps/api-gateway-e2e`).
