# RAGPolyglot

> **Work in progress.** Local polyglot RAG demo — architecture and pipeline are in place; features and polish are still evolving.

Event-driven retrieval system in an Nx monorepo: upload documents, chunk + embed, search with pgvector, stream results through a Nest gateway to a React UI.

## Stack

| Piece           | Tech                                   |
| --------------- | -------------------------------------- |
| API gateway     | NestJS (REST + Socket.IO)              |
| Documents       | .NET 10 Minimal API                    |
| RAG worker      | Go (chunk → embed → pgvector)          |
| Background jobs | Go event processor                     |
| Frontend        | React + Vite                           |
| Data            | PostgreSQL + pgvector, Redis, RabbitMQ |

## Architecture (short)

```
Upload → document-service → document.uploaded
       → rag-worker (chunk/embed/store) → document.processed|failed
       → document-service updates status; gateway fans out over WebSocket

Query  → gateway → Redis cache? → rag-worker search → stream chunks to UI
```

Agent answers today are **retrieved excerpts** (similarity-ranked), not LLM-synthesized replies. That is intentional for the current stage.

## Quick start

```bash
cp .env.example .env
npm install
docker compose up --build
npx nx serve react-frontend
```

- Gateway: `http://localhost:3000`
- UI: `http://localhost:4200` (proxies `/api` and Socket.IO)
- RabbitMQ UI: `http://localhost:15672` (guest/guest)

Auth is disabled for now for local/dev.

## Tests

```bash
npx nx run-many -t test
```

## Layout

```
apps/
  api-gateway/        Nest BFF
  document-service/   .NET metadata + events
  rag-worker/         Go RAG pipeline
  event-processor/    Go non-RAG jobs
  react-frontend/     UI
libs/
  shared/             TS contracts + status helpers
```

## Status

**WIP** — solid local pipeline and unit coverage on the critical paths. Not production-hardened (no auth, limited e2e, no LLM answer synthesis yet).

## License

Private / portfolio — not published as an open-source product unless stated otherwise.
