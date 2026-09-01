# document-service

.NET 10 metadata service. Owns `documents`: create/list/delete, pause/resume/retry, OCR language, publish `document.uploaded` / `document.deleted` / `document.pause`, consume `document.processed` / `document.failed` / `document.paused` / `document.progress`.

Applies the Postgres schema (including `document_chunks` and log tables). `document.progress` updates `progress_stage` / `progress_done` / `progress_total` and bumps `updated_at`. Maintenance `fail_stale` skips rows with `progress_stage = 'waiting_for_ocr'` so queued OCR jobs are not marked `stale_timeout`. Can list chunk text. Does not chunk, embed, or write vectors.

SQL lives in `Sql/**/*.sql` (embedded resources via `SqlScripts.Load`).

```bash
dotnet run --project apps/document-service
npx nx test document-service-tests
```

Docker: port `5000`.
