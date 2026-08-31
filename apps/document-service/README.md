# document-service

> **WIP** — .NET 10 document metadata service.

Owns `documents`: CRUD, OCR lang, pause/resume/retry, and maintenance hooks. Applies the Postgres schema (`documents`, `document_chunks` with **ON DELETE CASCADE**, log tables). Does not chunk, embed, or write vectors. Can list chunk **text**.

## Events

| Direction | Routing keys                                                                    |
| --------- | ------------------------------------------------------------------------------- |
| Publish   | `document.uploaded`, `document.deleted`, `document.pause`                       |
| Consume   | `document.processed`, `document.failed`, `document.paused`, `document.progress` |

**Delete:** remove the `documents` row first (chunks/checkpoints CASCADE), then publish `document.deleted` with retries. Publish failure after delete is logged; the API still returns success.

**Resume:** claim paused doc → re-publish `document.uploaded`.

## HTTP (main)

- `GET /health`
- Documents: create/list/get/delete, `POST .../retry`, `.../ocr-lang`, `.../pause`, `.../resume`, chunks list
- Maintenance (event-processor): `POST /api/documents/maintenance/fail-stale`, `.../auto-retry`

```bash
dotnet run --project apps/document-service
npx nx test document-service-tests
```

Docker: port `5000`.
