# document-service

.NET 10 metadata service. Owns `documents`: create/list/delete, pause/resume/retry, OCR language, publish `document.uploaded` / `document.deleted` / `document.pause`, consume `document.processed` / `document.failed` / `document.paused` / `document.progress`.

Applies the Postgres schema (including `document_chunks` and log tables). Can list chunk text. Does not chunk, embed, or write vectors.

SQL lives in `Sql/**/*.sql` (embedded resources via `SqlScripts.Load`).

```bash
dotnet run --project apps/document-service
npx nx test document-service-tests
```

Docker: port `5000`.
