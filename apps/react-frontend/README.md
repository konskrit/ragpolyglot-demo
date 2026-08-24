# react-frontend

> **WIP** — React + Vite UI for RAGPolyglot.

Dashboard (health, 24h metrics from `/api/metrics`, documents), upload, and agent chat with sources. **Stop** emits `chat:interrupt`.

Chat tokens arrive over WebSocket after the gateway has the full answer. Real answers need LM Studio (or another OpenAI-compatible server) locally. CI covers the pipeline via `apps/api-gateway-e2e`, not the browser.

```bash
npx nx serve react-frontend   # http://localhost:4200
npx nx test react-frontend
```

Leave `VITE_API_URL` / `VITE_WS_URL` empty so Vite proxies `/api` and `/ws`.
