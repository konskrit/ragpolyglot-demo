# @ragpolyglot-shared

Shared TypeScript contracts for the RAG polyglot monorepo: document/RAG DTOs, RabbitMQ event shapes, metrics types, and UI helpers used by the API gateway and React frontend.

## Contents

- **`interfaces/`** — `Document`, `DocumentSummary`, events (`document.uploaded`, `document.processed`, …), RAG/chat DTOs, `MetricsSnapshot`
- **`types/`** — status unions (`DocumentStatus`, `DocumentProgressStage`, …)
- **`types/contracts.ts`** — runtime helpers: status guards, OCR language menu rules, progress labels, `parseRagSources`, `formatErrorReason`

Go and .NET services define their own structs; keep event field names and status strings aligned with this package.

## Commands

```bash
npx nx test shared
npx nx build shared
```

## Import

```ts
import {
  DocumentSummary,
  OCR_LANGUAGE_NEEDED,
  showOcrLanguageMenu,
} from '@ragpolyglot-shared';
```
