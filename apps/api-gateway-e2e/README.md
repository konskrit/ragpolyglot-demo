HTTP + WebSocket tests against compose `--profile test` (starts `llm-stub` instead of LM Studio).

```bash
npm run test:integration
```

Needs `.env` (copy `.env.example`) and `.env.test.example`. Project `ragpolyglot-ci` stays isolated from a normal `docker compose up` stack. Teardown uses `-p ragpolyglot-ci` (a plain `docker compose down` will not stop it).

Covers gateway health, upload → ready, WebSocket chat + interrupt, and REST `POST /api/chat`.
