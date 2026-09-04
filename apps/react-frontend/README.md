# react-frontend

React + Vite UI: dashboard (health, 24h metrics from `/api/metrics`, recent documents), upload, document list/detail (pause, resume, retry, OCR language), and agent chat with sources.

Stop emits `chat:interrupt`. Chat needs a running LLM (LM Studio or OpenAI). CI covers the pipeline via `apps/api-gateway-e2e`, not the browser.

Compose includes this app (`react-frontend` → nginx on `${FRONTEND_PORT:-4200}`). Empty `VITE_*` build args keep same-origin `/api` and `/socket.io`; nginx proxies those to `api-gateway`.

```bash
docker compose up -d --build react-frontend   # production UI image
npx nx serve react-frontend                   # hot reload (dev)
npx nx test react-frontend
```

Leave `VITE_API_URL` / `VITE_WS_URL` empty so Vite (or nginx) proxies `/api` and `/socket.io` to the gateway. `vite.config.ts` aliases engine.io Node files to the browser builds so Socket.IO does not load Node `global`.

API reference (Scalar) lives on the gateway at http://localhost:3000/docs — not proxied through the UI port.
