# @ragpolyglot-shared

TypeScript types for the gateway and UI.

**Wire SoT** lives in `libs/contracts`:

- `schemas/wire.schema.json` — Rabbit events, worker HTTP/NDJSON, RAG query, Source, key Socket.IO payloads
- `schemas/routing-keys.json` — shared AMQP routing keys (TS/C#/Go)

Regenerate with `npm run contracts:gen`; drift fails via `npm run contracts:check` / `nx test contracts`.

**Still hand-written here:** Document entity / DocumentSummary, metrics, health, runtime config, enums/helpers in `contracts.ts`.

```bash
npx nx test shared
npx nx test contracts
npx nx build shared
```
