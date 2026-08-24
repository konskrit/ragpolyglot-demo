# RAGPolyglot

> **Work in progress.** Local polyglot RAG demo — architecture and pipeline are in place; features and polish are still evolving.

Event-driven retrieval in an Nx monorepo: upload documents, chunk + embed, search with pgvector, generate LLM answers from retrieved context, and show health/performance in a React UI.

## Stack

| Piece           | Tech                                   |
| --------------- | -------------------------------------- |
| API gateway     | NestJS (REST + Socket.IO)              |
| Documents       | .NET 10 Minimal API                    |
| RAG worker      | Go (chunk → embed → pgvector → LLM)    |
| Background jobs | Go event processor                     |
| Frontend        | React + Vite                           |
| Data            | PostgreSQL + pgvector, Redis, RabbitMQ |

## Architecture

### Document ingestion

```
Upload → api-gateway → document-service (metadata)
       → document.uploaded (RabbitMQ)
       → rag-worker: chunk → embed → pgvector
       → document.processed | document.failed
       → document-service updates status
       → gateway WebSocket: document:status-update
```

### Chat (RAG + LLM)

```
UI chat:query → gateway (Redis cache check)
             → rag-worker POST /api/chat (embed → search → LLM)
             → gateway emits chat:token → chat:complete
               (word-by-word playback of the full answer)

Stop → chat:interrupt → abort in-flight worker HTTP → LLM request cancels
```

Answers are **LLM-generated from retrieved chunks**. If the LLM is down, chat fails — no extractive fallback.

When `EMBEDDING_FALLBACK=true`, ingestion uses hash embeddings if the embedding API is missing or fails (typical when LM Studio serves chat only).

### Dashboard

The UI polls `GET /api/health` and `GET /api/metrics`. Metrics come from Redis cache counters plus Postgres `query_logs`, `system_logs`, and document status counts.

## Quick start

```bash
cp .env.example .env
npm install
docker compose up --build
npx nx serve react-frontend
```

| Service          | URL                                  |
| ---------------- | ------------------------------------ |
| Gateway          | http://localhost:3000                |
| UI               | http://localhost:4200                |
| RabbitMQ UI      | http://localhost:15672 (guest/guest) |
| Document service | http://localhost:5000                |
| RAG worker       | http://localhost:8081                |

Auth is disabled for local/dev.

### LLM (required for chat)

Set in `.env`:

- `LLM_MODEL` — model id (required; e.g. `local-model` for LM Studio)
- `LMSTUDIO_API_URL` — OpenAI-compatible endpoint (`.env.example` uses `http://host.docker.internal:1234/v1`)

For OpenAI, set `OPENAI_API_KEY` and optionally `OPENAI_API_BASE_URL`. Chat uses `LMSTUDIO_API_URL` when set, otherwise OpenAI.

Start the LLM before using Agent mode.

## Tests

**Unit** (no Docker stack):

```bash
npx nx run-many -t test --exclude=api-gateway-e2e,react-frontend-e2e
```

**Integration** (CI — `--profile test` starts `llm-stub`; isolated compose project `ragpolyglot-ci`):

```bash
npm run test:integration
docker compose --profile test -p ragpolyglot-ci down -v
```

Uses `.env` (from `.env.example`) plus `.env.test.example`. No LM Studio.

**Manual** (local LM Studio): upload → Ready → chat in Agent mode.

## Layout

```
apps/
  api-gateway/        Nest BFF — REST, WebSocket, Redis cache, /api/metrics
  api-gateway-e2e/    Integration tests (--profile test + llm-stub)
  document-service/   .NET metadata + events
  rag-worker/         Go RAG pipeline + /api/chat
  event-processor/    Go job handlers (no in-repo publisher yet)
  react-frontend/     UI (dashboard, upload, agent chat)
libs/
  shared/             TS contracts
tools/
  llm-stub/           OpenAI-compatible stub for CI
```

## Status

**WIP** — upload → vector store → LLM chat with interrupt, dashboard metrics, unit tests, CI integration with a stub LLM. Not production-hardened (no auth, no browser e2e). Event-processor job handlers exist but nothing in this repo publishes jobs yet.

## License

Private / portfolio — not published as an open-source product unless stated otherwise.
