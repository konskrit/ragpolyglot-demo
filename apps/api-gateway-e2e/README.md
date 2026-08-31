# api-gateway-e2e

HTTP + WebSocket tests against compose `--profile test` (starts `llm-stub` instead of LM Studio).

```bash
npm run test:integration
```

Needs `.env` (copy `.env.example`) and `.env.test.example`. Uses `docker-compose.ci.yml` so rag-worker does not request a GPU. Project `ragpolyglot-ci` stays isolated from a normal `docker compose up` stack. Teardown uses `-p ragpolyglot-ci` (a plain `docker compose down` will not stop it).

Covers gateway health, upload → ready, WebSocket chat + interrupt, and REST `POST /api/chat`.
