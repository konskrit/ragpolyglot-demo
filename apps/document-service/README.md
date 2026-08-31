# document-service

> **WIP** — .NET 10 document metadata service.

Owns `documents`: create/list/delete, publish `document.uploaded` / `document.deleted`, consume `document.processed` / `document.failed` and update status. Applies the Postgres schema (including `document_chunks` and log tables).

Can list chunk **text** for a document. Does not chunk, embed, or write vectors.

```bash
dotnet run --project apps/document-service
npx nx test document-service-tests
```

Docker: port `5000`.
