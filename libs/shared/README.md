# @ragpolyglot-shared

TypeScript contracts for the gateway and UI: document/RAG DTOs, events, `MetricsSnapshot`, and status helpers (`DOCUMENT_STATUSES`, `DOCUMENT_PROGRESS_STAGES` including `waiting_for_ocr`, `normalizeDocumentStatus`, `formatDocumentProgressLabel`).

Go and .NET keep their own copies of the event shapes.

```bash
npx nx test shared
npx nx build shared
```
