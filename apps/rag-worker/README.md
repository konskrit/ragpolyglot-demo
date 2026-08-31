# rag-worker

Go RAG pipeline worker.

Consumes `document.uploaded` / `document.deleted` / `document.pause`, chunks (~750 tokens, 10% overlap), embeds (API; hash fallback only when `EMBEDDING_FALLBACK=true`), writes pgvector chunks, publishes `document.processed` / `document.failed` / `document.paused` / `document.progress`. Logs query and ingest timings to Postgres.

Delete bumps ingest generation so in-flight work stops and leftover chunks/checkpoints are wiped.

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
