# rag-worker

> **WIP** — Go RAG pipeline worker.

Consumes `document.uploaded` / `document.deleted`, chunks (~750 tokens, 10% overlap), embeds (API or hash fallback when `EMBEDDING_FALLBACK=true`), writes pgvector chunks, publishes `document.processed` / `document.failed`.

HTTP API:

- `GET /health`
- `POST /api/search` — embed query + vector search (hits only)
- `POST /api/chat` — embed → search → LLM answer (requires `LLM_MODEL`; uses `LMSTUDIO_API_URL` or OpenAI)

CI uses `docker compose --profile test` with `tools/llm-stub` instead of LM Studio.

```bash
cd apps/rag-worker && go run .
npx nx test rag-worker
```

Docker: compose service on port `8081`. Shares `/uploads` with the gateway.
