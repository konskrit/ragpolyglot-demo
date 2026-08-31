# react-frontend

> **WIP** — React + Vite UI for RAGPolyglot.

Dashboard (health, 24h metrics from `/api/metrics`, documents), upload, and agent chat with sources.

**Documents:** Pause while processing, Resume when paused, Retry on failed/ready, live OCR language, **Delete always available** (including mid-ingest). Shared `DocumentActions` + `document:status-update` (progress stages / %).

**Chat:** `chat:token` streams live over Socket.IO; `chat:complete` carries sources / interrupted / cacheHit. **Stop** → `chat:interrupt` (also on leave Agent). Real answers need LM Studio (or another OpenAI-compatible server). CI covers the pipeline via `apps/api-gateway-e2e`, not the browser.

```bash
npx nx serve react-frontend   # http://localhost:4200
npx nx test react-frontend
```

Leave `VITE_API_URL` / `VITE_WS_URL` empty so Vite proxies `/api` and `/socket.io` (Socket.IO namespace `/ws`).
