# react-frontend

React + Vite UI: dashboard (health, 24h metrics from `/api/metrics`, recent documents), upload, document list/detail (pause, resume, retry, OCR language), and agent chat with sources.

Stop emits `chat:interrupt`. Chat needs a running LLM (LM Studio or OpenAI). CI covers the pipeline via `apps/api-gateway-e2e`, not the browser.

```bash
npx nx serve react-frontend   # http://localhost:4200
npx nx test react-frontend
```

Leave `VITE_API_URL` / `VITE_WS_URL` empty so Vite proxies `/api` and `/socket.io` to the gateway. `vite.config.ts` aliases engine.io Node files to the browser builds so Socket.IO does not load Node `global`.
