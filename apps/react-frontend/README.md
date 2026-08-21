# react-frontend

> **WIP** — React + Vite UI for RAGPolyglot.

Dashboard (health + documents), upload, and agent chat. Uses a shared documents context, WebSocket status updates, and Vite proxies to the gateway in dev.

```bash
npx nx serve react-frontend   # http://localhost:4200
npx nx test react-frontend
```

Leave `VITE_API_URL` / `VITE_WS_URL` empty in `.env` so the proxy and `/ws` namespace work.
