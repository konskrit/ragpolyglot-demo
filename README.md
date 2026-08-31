# RAGPolyglot

Local polyglot RAG system: upload documents, chunk and embed them, search with pgvector, and chat with an LLM that answers only from retrieved context.

Built as a personal stack and a portfolio piece — event-driven microservices in an Nx monorepo, not a product. Auth is off. Data stays on your machine.

## Stack

| Piece           | Tech                                          |
| --------------- | --------------------------------------------- |
| API gateway     | NestJS (REST + Socket.IO)                     |
| Documents       | .NET 10 Minimal API                           |
| RAG worker      | Go (extract → chunk → embed → pgvector → LLM) |
| Background jobs | Go event processor                            |
| Frontend        | React + Vite                                  |
| Data            | PostgreSQL + pgvector, Redis, RabbitMQ        |

## Architecture

### Document ingestion

```
Upload → api-gateway → document-service (metadata)
       → document.uploaded (RabbitMQ)
       → rag-worker: extract → chunk → embed → pgvector
       → document.processed | document.failed
       → document-service updates status
       → gateway WebSocket: document:status-update
```

Uploads: `.txt`, `.md`, `.markdown`, `.json`, `.pdf`. PDFs can run OCR (Tesseract by default; Ancient Greek / `grc` uses Kraken, with Tesseract fallback). The UI can pause, resume, retry, and set OCR language.

### Chat (RAG + LLM)

```
UI chat:query → gateway Redis cache
  hit  → one chat:token (stored answer) → chat:complete
  miss → rag-worker POST /api/chat/stream → native token deltas → chat:complete

Stop → chat:interrupt → abort in-flight worker HTTP → LLM request cancels
```

Answers are LLM-generated from retrieved chunks only. If nothing is retrieved, the worker returns a fixed I-don't-know line without calling the LLM. If the LLM is down, chat fails — no extractive fallback.

Hash embedding fallback is off by default (`EMBEDDING_FALLBACK=false`). Set `true` when the embedding API is missing or fails (CI: `.env.test.example`).

### Dashboard

The UI polls `GET /api/health` and `GET /api/metrics`. Metrics come from Redis cache counters plus Postgres `query_logs`, `system_logs`, and document status counts.

## Quick start

```bash
cp .env.example .env
npm install
docker compose up --build
npx nx serve react-frontend
```

Infra only (Postgres on `5433`, Redis, RabbitMQ): `docker compose -f docker-compose.debug.yml up` — use when the apps run on the host.

| Service          | URL                                  |
| ---------------- | ------------------------------------ |
| Gateway          | http://localhost:3000                |
| UI               | http://localhost:4200                |
| RabbitMQ UI      | http://localhost:15672 (guest/guest) |
| Document service | http://localhost:5000                |
| RAG worker       | http://localhost:8081                |

### LLM (required for chat)

Set in `.env`:

- `LLM_MODEL` — model id (required; e.g. `local-model` for LM Studio)
- `LMSTUDIO_API_URL` — OpenAI-compatible endpoint (`.env.example` uses `http://host.docker.internal:1234/v1`)

For OpenAI, set `OPENAI_API_KEY` and optionally `OPENAI_API_BASE_URL`. Chat uses `LMSTUDIO_API_URL` when set, otherwise OpenAI.

Start the LLM before using Agent mode.

### GPU / OCR

`rag-worker` is composed with `gpus: all` so Kraken can use CUDA. That needs the [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html). If the daemon has no NVIDIA runtime, `docker compose up` can fail — comment out `gpus: all` in `docker-compose.yml` and Kraken will run on CPU (or fall back to Tesseract).

## Tests

**Unit** (no Docker stack):

```bash
npx nx run-many -t test --exclude=api-gateway-e2e,react-frontend-e2e
```

**Integration** (CI — `--profile test` starts `llm-stub`; isolated compose project `ragpolyglot-ci`):

```bash
npm run test:integration
```

Uses `.env` (from `.env.example`) plus `.env.test.example`. No LM Studio. Tears down with `-p ragpolyglot-ci` when the run succeeds.

**Manual:** upload → Ready → chat in Agent mode.

## Layout

```
apps/
  api-gateway/        Nest BFF — REST, WebSocket, Redis cache, /api/metrics
  api-gateway-e2e/    Integration tests (--profile test + llm-stub)
  document-service/   .NET metadata + events
  rag-worker/         Go RAG pipeline + OCR + /api/chat
  event-processor/    Go job runner + in-process scheduler
  react-frontend/     UI (dashboard, upload, agent chat)
libs/
  shared/             TS contracts
tools/
  llm-stub/           OpenAI-compatible stub for CI
```

## Scope

Local/dev only: no auth, no multi-user isolation.
