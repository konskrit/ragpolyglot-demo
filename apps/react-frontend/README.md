# react-frontend

> **WIP** — React + Vite UI for RAGPolyglot.

Dashboard (health + documents), upload, and agent chat with cited sources. Chat uses WebSocket streaming; **Stop** sends `chat:interrupt` to cancel the in-flight LLM request.

Requires LM Studio for real chat locally. CI tests the pipeline via `apps/api-gateway-e2e`.

```bash
npx nx serve react-frontend   # http://localhost:4200
npx nx test react-frontend
```

Leave `VITE_API_URL` / `VITE_WS_URL` empty in `.env` so the proxy and `/ws` namespace work.
