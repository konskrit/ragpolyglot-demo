# RAGPolyglot

Local polyglot RAG system: upload documents, chunk and embed them, search with pgvector, and chat with an LLM that answers only from retrieved context.

Built as a personal stack and a portfolio piece — event-driven microservices in an Nx monorepo, not a product. Auth is off. Data stays on your machine.

## Stack

| Piece           | Tech                                          |
| --------------- | --------------------------------------------- |
| API gateway     | NestJS (REST + Socket.IO + Scalar `/docs`)    |
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

Uploads: `.txt`, `.md`, `.markdown`, `.json`, `.pdf`. PDFs can run OCR (Tesseract by default; Ancient Greek / `grc` uses Kraken 7, with Tesseract fallback). The UI can pause, resume, retry, and set OCR language. Progress stages: `waiting_for_ocr` (queued on the OCR GPU slot), `extracting`, `embedding`. During Kraken ingest, `document.progress` counts **OCR’d** pages (after each batch), not pdftoppm renders.

### Chat (RAG + LLM)

```
UI chat:query → gateway Redis cache
  hit  → one chat:token (stored answer) → chat:complete
  miss → rag-worker POST /api/chat/stream → native token deltas → chat:complete

Stop → chat:interrupt → abort in-flight worker HTTP → LLM request cancels
```

Answers are LLM-generated from retrieved chunks only. If nothing is retrieved, the worker returns a fixed I-don't-know line without calling the LLM. If the LLM is down, chat fails — no extractive fallback.

Hash embedding fallback is off by default (`EMBEDDING_FALLBACK=false`). Set `true` when the embedding API is missing or fails (CI: `.env.test.example`).

**Embeddings:** `EMBEDDING_DIMENSION` must match the model behind `LMSTUDIO_API_URL` / OpenAI (e.g. **768** for many LM Studio embed models, **1536** for `text-embedding-ada-002`). It is baked into `document_chunks.embedding` at schema init — change dimension only with a fresh DB or a migration.

### Dashboard

The UI polls `GET /api/health` and `GET /api/metrics`. Metrics come from Redis cache counters plus Postgres `query_logs`, `system_logs`, and document status counts.

### Public API (custom clients)

All browser and third-party traffic goes through the **api-gateway** — not document-service or rag-worker directly.

| Need                         | Where                                                    |
| ---------------------------- | -------------------------------------------------------- |
| Interactive REST docs        | http://localhost:3000/docs (Scalar)                      |
| OpenAPI JSON                 | http://localhost:3000/api/openapi-json                   |
| TypeScript contracts         | `libs/shared` (`interfaces.ts`, `contracts.ts`)          |
| Streaming chat + live status | Socket.IO namespace `/ws` (event table in `/docs` intro) |

Vite proxies `/api` and `/socket.io` only — open `/docs` on port **3000**, not 4200.

## Quick start

```bash
cp .env.example .env
docker compose up --build   # first time or after image/Dockerfile changes
```

Day-to-day: `docker compose up -d` (no `--build`). Rebuild one service when needed, e.g. `docker compose up -d --build rag-worker`.

UI is served by the `react-frontend` container (nginx on `${FRONTEND_PORT:-4200}`), proxying `/api` and `/socket.io` to the gateway. For hot-reload UI work: `npx nx serve react-frontend` (still needs the stack up).

Infra only (Postgres on `5433`, Redis, RabbitMQ): `docker compose -f docker-compose.debug.yml up` — use when the apps run on the host.

| Service           | URL                                    |
| ----------------- | -------------------------------------- |
| UI                | http://localhost:4200                  |
| Gateway           | http://localhost:3000                  |
| API docs (Scalar) | http://localhost:3000/docs             |
| OpenAPI JSON      | http://localhost:3000/api/openapi-json |
| RabbitMQ UI       | http://localhost:15672 (guest/guest)   |
| Document service  | http://localhost:5000                  |
| RAG worker        | http://localhost:8081                  |

### LLM (required for chat)

Set in `.env`:

- `LLM_MODEL` — model id (required; e.g. `local-model` for LM Studio)
- `LMSTUDIO_API_URL` — OpenAI-compatible endpoint (`.env.example` uses `http://host.docker.internal:1234/v1`)

For OpenAI, set `OPENAI_API_KEY` and optionally `OPENAI_API_BASE_URL`. Chat uses `LMSTUDIO_API_URL` when set, otherwise OpenAI.

Start the LLM before using Agent mode.

### GPU / OCR

`rag-worker` is composed with `gpus: all` so Kraken can use CUDA. That needs the [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html). If the daemon has no NVIDIA runtime, `docker compose up` can fail — comment out `gpus: all` in `docker-compose.yml`. CI uses `docker-compose.ci.yml` to drop GPUs (GitHub-hosted runners have no NVIDIA runtime).

Kraken 7 and CUDA torch live in a **separate Docker stage** split into two layers (torch, then kraken deps). Go-only `rag-worker` rebuilds skip both; kraken-version bumps skip the torch layer. Pip and model caches speed re-runs when a layer does execute.

**Concurrent OCR:** `OCR_INGEST_PREFETCH` caps how many documents can run Kraken OCR at once; `KRAKEN_GPU_CONCURRENT` (defaults to the same value) caps parallel CUDA `kraken` subprocesses and splits `KRAKEN_VRAM_BUDGET_MB` per job. Queued docs publish `waiting_for_ocr` (heartbeat every 30s) and are excluded from stale-timeout maintenance. Compose, Dockerfiles, env: [docs/docker-compose.yml/README.md](docs/docker-compose.yml/README.md).

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
  api-gateway/        Nest BFF — REST, WebSocket, Scalar `/docs`, Redis cache
  api-gateway-e2e/    Integration tests (--profile test + llm-stub)
  document-service/   .NET metadata + events
  rag-worker/         Go RAG pipeline + OCR + /api/chat (`sql/*.sql` embedded)
  event-processor/    Go job runner + in-process scheduler (`sql/*.sql` embedded)
  react-frontend/     UI (dashboard, upload, agent chat)
libs/
  shared/             TS contracts
tools/
  llm-stub/           OpenAI-compatible stub for CI
```

## Scope

Local/dev only: no auth, no multi-user isolation.
