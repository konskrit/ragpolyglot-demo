# rag-worker

> **WIP** — Go RAG pipeline worker.

Consumes `document.uploaded` / `document.deleted`, chunks (~750 tokens, 10% overlap), embeds (API or hash fallback when `EMBEDDING_FALLBACK=true`), writes pgvector chunks, publishes `document.processed` / `document.failed`. Logs query and ingest timings to Postgres.

HTTP:

- `GET /health`
- `POST /api/search` — embed query + vector search
- `POST /api/chat` — embed → search → LLM (full JSON answer)
- `POST /api/chat/stream` — same pipeline; NDJSON `token` / `done` events (`LLM_MODEL` required; `LMSTUDIO_API_URL` or OpenAI)

CI uses `--profile test` and `tools/llm-stub` instead of LM Studio.

```bash
cd apps/rag-worker && go run .
npx nx test rag-worker
```

Docker: port `8081`. Shares `/uploads` with the gateway.
