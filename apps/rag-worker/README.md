# rag-worker

Go RAG pipeline. Consumes `document.uploaded` / `document.deleted` / `document.pause`, extracts text (native PDF or OCR), chunks (~750 tokens, 10% overlap), embeds (API; hash fallback only when `EMBEDDING_FALLBACK=true`), writes pgvector chunks, publishes `document.processed` / `document.failed` / `document.paused` / `document.progress`.

OCR: Tesseract for most languages; Kraken 7 for Ancient Greek (`grc`). Pause kills the Kraken/Python process group on Linux so OCR stops without waiting out the current CLI batch. No CUDA: Kraken retries on CPU. Kraken missing or still failing: Tesseract.

**Progress:** `document.progress` stages — `waiting_for_ocr` (blocked on `ocrIngestSem`, heartbeat every 30s), `extracting` (Kraken/Tesseract; counts OCR’d pages per batch, not pdftoppm), `embedding`. **Concurrency:** `OCR_INGEST_PREFETCH` + `KRAKEN_GPU_CONCURRENT` (default = prefetch) allow multiple Kraken CUDA jobs; VRAM budget is split per concurrent job. Kraken batches render PDF pages in parallel (`PageWorkers`); CUDA runs use a sized semaphore (not a single global mutex).

**Retry / OCR language:** changing `ocrLang` on retry or via `/ocr-lang` sets `resetIngest` on `document.uploaded`. The worker wipes checkpoint + chunks and re-runs OCR from page 1. Same-language retry still resumes from checkpoint (e.g. embedding failure).

Compose sets `gpus: all` (see root README / [docs/docker-compose.yml](../../docs/docker-compose.yml/README.md)).

HTTP:

- `GET /health`
- `GET /api/ocr-languages`
- `POST /api/search` — embed query + vector search
- `POST /api/chat` — embed → search → LLM (full JSON answer)
- `POST /api/chat/stream` — same pipeline; NDJSON `token` / `done` (`LLM_MODEL` required; `LMSTUDIO_API_URL` or OpenAI)

CI uses `--profile test` and `tools/llm-stub` instead of LM Studio (`INSTALL_KRAKEN=0` in `.env.test.example`).

```bash
cd apps/rag-worker && go run .
npx nx test rag-worker
```

Docker: port `8081`. Shares `/uploads` with the gateway.

## SQL

Queries live in `sql/*.sql`, embedded at build time via `//go:embed` (`sql/load.go` → `Must(name)`). `storage/` loads them — no inline SQL in Go.

| File                                                                     | Used by             |
| ------------------------------------------------------------------------ | ------------------- |
| `schema.sql`                                                             | `EnsureSchema`      |
| `insert_chunk.sql`                                                       | `InsertChunks`      |
| `delete_chunks.sql`                                                      | `DeleteChunks`      |
| `count_chunks.sql`                                                       | `CountChunks`       |
| `search_similar.sql`                                                     | `SearchSimilar`     |
| `log_system.sql` / `log_query.sql`                                       | metrics             |
| `get_checkpoint.sql` / `upsert_checkpoint.sql` / `delete_checkpoint.sql` | ingest pause/resume |

Same pattern as document-service (`Sql/`) and api-gateway (`src/assets/sql/`).
