# document-service

> **WIP** — .NET 10 document metadata service.

Owns the `documents` table: create/list/delete, publish `document.uploaded` / `document.deleted`, consume `document.processed` / `document.failed` and update status. Does **not** chunk, embed, or touch vectors.

```bash
dotnet run --project apps/document-service
npx nx test document-service-tests
```

Docker: compose service on port `5000`.
