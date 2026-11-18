# @ragpolyglot-shared

TypeScript types for the gateway and UI.

**Wire SoT** (RabbitMQ document/summarize events, rag-worker search/chat HTTP + NDJSON) lives in `libs/contracts/schemas/wire.schema.json`. Regenerate with `npm run contracts:gen`; drift fails via `npm run contracts:check` / `nx test contracts`. Generated TS is re-exported from here (`src/lib/generated/wire.ts`).

**Still hand-written here:** Document / DocumentSummary, Socket.IO payloads, metrics, health, runtime config, enums/helpers in `contracts.ts`.

```bash
npx nx test shared
npx nx test contracts
npx nx build shared
```
