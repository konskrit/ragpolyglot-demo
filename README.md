# RAGPolyglot

> **Work in progress.** Local polyglot RAG demo — architecture and pipeline are in place; features and polish are still evolving.

Event-driven retrieval system in an Nx monorepo: upload documents, chunk + embed, query with pgvector, generate LLM answers from retrieved context, and stream results through a Nest gateway to a React UI.

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
             → gateway streams chat:token → chat:complete (simulated token playback)

Stop → chat:interrupt → abort in-flight worker request → LLM stops
```

Agent answers are **LLM-generated from retrieved chunks** (OpenAI-compatible API). If the LLM is down, chat returns an error — there is no extractive fallback for answers.

When `EMBEDDING_FALLBACK=true`, ingestion uses hash-based embeddings if the embedding API is missing or fails (typical when LM Studio serves chat only).

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
- `LMSTUDIO_API_URL` — local OpenAI-compatible endpoint (default in `.env.example`: `http://host.docker.internal:1234/v1`)

For OpenAI instead, set `OPENAI_API_KEY` and optionally `OPENAI_API_BASE_URL`. Chat uses `LMSTUDIO_API_URL` when set, otherwise OpenAI.

Start your LLM server before asking questions in Agent mode.

## Tests

**Unit** (no Docker):

```bash
npx nx run-many -t test --exclude=api-gateway-e2e,react-frontend-e2e
```

**Integration** (CI — `--profile test` starts stub LLM; isolated project `ragpolyglot-ci`):

```bash
npm run test:integration
docker compose --profile test -p ragpolyglot-ci down -v   # when done
```

**Manual** (local LM Studio): upload → Ready → chat in Agent mode.

## Layout

```
apps/
  api-gateway/        Nest BFF — REST, WebSocket chat, Redis cache
  api-gateway-e2e/    Integration tests (--profile test + llm-stub)
  document-service/   .NET metadata + events
  rag-worker/         Go RAG pipeline + /api/chat
  event-processor/    Go non-RAG jobs
  react-frontend/     UI (dashboard, upload, agent chat)
libs/
  shared/             TS contracts + status helpers
tools/
  llm-stub/           OpenAI-compatible stub for CI
```

## Status

**WIP** — end-to-end upload, vector search, LLM chat with stop/interrupt, unit tests, and CI integration tests (stub LLM). Not production-hardened (no auth, no browser e2e).

## License

Private / portfolio — not published as an open-source product unless stated otherwise.
