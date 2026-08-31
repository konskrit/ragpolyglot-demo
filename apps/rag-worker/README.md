# rag-worker

Go RAG pipeline worker.

Consumes `document.uploaded` / `document.deleted` / `document.pause`. Extract/OCR → chunk (~750 tokens, 10% overlap) → embed (API; hash fallback only when `EMBEDDING_FALLBACK=true`) → pgvector. Publishes `document.processed` / `document.failed` / `document.paused` / `document.progress`. Logs timings to Postgres.

Ingest lives in `consumer/ingest.go` + `ingest_extract.go` + `ingest_embed.go` (checkpoints resume OCR/embedding). Upload messages are **acked early** once extract starts so long OCR does not hold the queue; pause/delete still stop in-flight work via generation + Redis/local flags.

**Delete:** bumps ingest generation, wipes chunks/checkpoints (retries + `requeueBackoff` on failure; async wipe if the upload was already acked). Document-service CASCADE usually clears rows first; the worker still stops in-flight ingest.

HTTP:

- `GET /health`
- `GET /api/ocr-languages`
- `POST /api/search` — embed query + vector search
- `POST /api/chat` — embed → search → LLM (full JSON answer)
- `POST /api/chat/stream` — same pipeline; NDJSON `token` / `done` (`LLM_MODEL` required; `LMSTUDIO_API_URL` or OpenAI)

CI uses `--profile test` and `tools/llm-stub` instead of LM Studio.

```bash
cd apps/rag-worker && go run .
npx nx test rag-worker
```

Docker: port `8081`. Shares `/uploads` with the gateway.
