# rag-worker

Go RAG pipeline. Consumes `document.uploaded` / `document.deleted` / `document.pause`, extracts text (native PDF or OCR), chunks (~750 tokens, 10% overlap), embeds (API; hash fallback only when `EMBEDDING_FALLBACK=true`), writes pgvector chunks, publishes `document.processed` / `document.failed` / `document.paused` / `document.progress`.

OCR: Tesseract for most languages; Kraken 7 for Ancient Greek (`grc`). Pause kills the Kraken/Python process group on Linux so OCR stops without waiting out the current CLI batch. No CUDA: Kraken retries on CPU. Kraken missing or still failing: Tesseract. `document.progress` during Kraken reports OCR’d pages per batch (not pdftoppm renders). Compose sets `gpus: all` (see root README / [docs/docker-compose.yml](../../docs/docker-compose.yml/README.md)).

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
