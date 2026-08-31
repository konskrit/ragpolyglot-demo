# @ragpolyglot-shared

Shared TypeScript contracts for the RAG polyglot monorepo: document/RAG DTOs, RabbitMQ event shapes, metrics types, conversation types, and UI helpers used by the API gateway and React frontend.

## Contents

- **`interfaces/`** — `Document`, `DocumentSummary`, RabbitMQ events (`document.uploaded` / `deleted` / `processed` / `failed` / `pause` / `paused` / `progress`), RAG/chat DTOs (`ChatCompletePayload`, …), `MetricsSnapshot`, `SystemHealth`, conversations
- **`types/`** — status unions (`DocumentStatus` includes `paused`, `DocumentProgressStage`: `extracting` | `embedding`, …)
- **`types/contracts.ts`** — runtime helpers: status guards, OCR menu rules (`showOcrLanguageMenu`, `canChangeOcrLangLive`, `OCR_LANGUAGE_NEEDED`), progress labels, `parseRagSources`, `formatErrorReason`

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
